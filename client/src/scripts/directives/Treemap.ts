/**
 * Created by Holger Stitz on 06.03.2015.
 */
import * as angular from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import Animator, { IAnimateable, PVDAnimator } from '../services/Animator';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { nextID, onDelete, tooltip, idealTextColor, modifyConfig } from './VisUtils';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import { Node, Infrastructure } from '../models/Infrastructure';
import { compute } from '../models/DOI';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import ChangeBorder, { PVDChangeBorder, SegmentRepresentation } from '../services/ChangeBorderService';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';

/**
 *
 * @see http://www.billdwhite.com/wordpress/wp-content/js/treemap_headers_04.html
 */
class PVDTreemap implements IAnimateable {

  private segmentRepVisConfigId = 'treemap';
  private segmentRep;

  private indexPointTs = 0;

  private supportsForeignObject = true; //Modernizr.svgforeignobject;
  private chartWidth = 0;
  private chartHeight = 0;
  private chartFullWidth = 0;
  private chartFullHeight = 0;
  private xscale = d3.scale.linear();//.range([0, this.chartWidth]);
  private yscale = d3.scale.linear();//.range([0, this.chartHeight]);
  private padding = 1;

  private selectedSector;
  private isCollapsed = false;
  private useDoiColoring = true;

  private colorScale = d3.scale.ordinal().range([
    '#1f77b4',
    '#ff7f0e',
    //'#2ca02c',
    //'#d62728',
    '#9467bd',
    '#8c564b',
    '#e377c2',
    '#7f7f7f',
    '#bcbd22',
    '#17becf',
    '#393b79',
    '#8c6d31',
    '#7b4173',
  ]); //d3.scale.category10();
  private headerHeight = 20 * ApplicationConfiguration.zoomFactor;
  private headerColor = '#cccccc'; // use 6 digits to calculate idealColor
  private transitionDuration = 500;

  private data;
  private rootNode;
  private selectedNode;
  private nodesMap: d3.Map<any> = d3.map();

  private nodePositions;
  private parents;
  private children;

  private treemap: d3.Layout.TreeMapLayout;

  private svg;
  private chart;
  private defs;
  private filter;
  private $parentCells;
  private $childrenCells;

  private isDrawnOnce = false;
  private fullscreen = false;

  constructor(private $root, private infra: Infrastructure,
    private config: PVDHierarchyConfig, private numParentNodesLevel,
    private isStandalone) {
    this.segmentRep = this.config.changeBorder.getSegmentRepByVisConfigId(this.segmentRepVisConfigId);
    this.attachListener();
    this.initLayout();

    // on standalone initialize here and don't wait for changeBorder maxsize event (triggered in ThermalLayout)
    if (this.isStandalone === true) {
      this.rescale();
      this.initTreemap();
      this.draw();
    }
  }

  private attachListener(): void {
    var that = this;

    var id = '.tree' + nextID();

    // initialize layout again and add the new node to DOM
    this.infra.on('addNode' + id, (newNode) => {
      that.initTreemap();
      that.draw();
    });

    // window resize is triggered via changeBorder.maxsize
    /*this.config.windowResize.on('change'+id, () => {
      that.rescale();
      that.zoom(that.selectedNode);
    });*/

    this.config.changeBorder.on('crossed' + id, (node: Node, newSegmentRep: SegmentRepresentation) => {
      if (node === undefined || newSegmentRep === undefined) { return; }

      if (newSegmentRep.isHidden('Treemap')) {
        that.$childrenCells.filter((d) => d.node === node).classed('crossed', true);
      } else {
        that.$childrenCells.filter((d) => d.node === node).classed('crossed', false);
      }
    });

    this.config.changeBorder.on('maxsize' + id, () => {
      that.chartFullWidth = that.config.changeBorder.vertical.maxSize + that.config.changeBorder.vertical.marginStart + that.config.changeBorder.vertical.marginEnd + 1;
      that.chartFullHeight = that.config.changeBorder.horizontal.maxSize + that.config.changeBorder.horizontal.marginStart + that.config.changeBorder.horizontal.marginEnd + 1 - 15;

      that.rescale();
      that.initTreemap();
      that.draw();
      //that.zoom(that.selectedNode);
    });

    this.config.changeBorder.on('drag' + id, (border, orientation) => {
      if (orientation === 'horizontal') {
        that.rescale();
        that.zoom(that.selectedNode);
      }
    });

    this.config.changeBorder.on('req_layout_coord' + id, (infra, firstCall) => {
      that.replyLayoutCoords(infra, firstCall);
    });

    this.config.selection.on('selectall' + id, (newNode, allNodes, oldNodes) => {
      that.svg.classed('selection-enabled', (allNodes.length > 0));
      that.$childrenCells.each(function (d) {
        d3.select(this).classed('selected', (allNodes.indexOf(d.node) > -1))
      });
    });

    this.config.selection.on('indexPoint' + id, (oldValue, newValue) => {
      that.indexPointTs = newValue;
      that.initTreemap();
      that.draw();
    });

    this.config.animator.push(this);
    onDelete(this.$root, () => {
      this.infra.on('addNode' + id, null);
      this.config.animator.remove(this);
      //this.config.windowResize.on('change' + id, null);
      this.config.changeBorder.on('crossed' + id, null);
      this.config.changeBorder.on('req_layout_coord' + id, null);
      this.config.selection.on('hover' + id, null);
      this.config.selection.on('infra' + id, null);
      this.config.selection.on('selectall' + id, null);
      this.config.selection.on('indexPoint' + id, null);
    });
  }

  private rescale() {
    var that = this,
      offsetToLeftBorder = 1,
      offsetToTop = 15,
      left = 15, // padding-left of outer .col-md-9
      centerRange = that.config.changeBorder.vertical.posRangeBySegment(that.segmentRep.vSegment);

    // on standalone use the parent's node dimension
    if (this.isStandalone === true) {
      var size = that.$root.node().getBoundingClientRect();

      that.chartWidth = size.width;
      that.chartHeight = window.innerHeight - size.top - 30;

    } else if (that.fullscreen) {
      that.chartWidth = that.chartFullWidth;
      that.chartHeight = that.chartFullHeight;
      //left += 0;

    } else {
      that.chartWidth = centerRange[1] - centerRange[0] - offsetToLeftBorder;
      that.chartHeight = that.config.changeBorder.horizontal.maxSize + that.config.changeBorder.horizontal.marginStart - offsetToTop;
      left += centerRange[0] +
        offsetToLeftBorder +
        that.config.changeBorder.vertical.marginStart;
    }

    that.xscale.range([0, that.chartWidth]);
    that.yscale.range([0, that.chartHeight]);

    that.svg
      .attr('width', that.chartWidth)
      .attr('height', (that.isCollapsed) ? that.headerHeight : that.chartHeight);

    // set offset only if the Treemap is used together with the ThermalLayout
    if (this.isStandalone === false) {
      d3.select(that.$root.node().parentNode)
        .style('left', left + 'px')
        .style('top', offsetToTop + 'px');
    }

    if (!that.fullscreen) {
      that.replyLayoutCoords(that.infra, false);
    }
  }

  private replyLayoutCoords(infra, isFirstCall) {
    if (this.infra !== infra || this.nodePositions === undefined) { return; }
    var that = this,
      offsetToLeftBorder = 1,
      containerMarginLeft = 15; // padding-left of outer .col-md-9

    var offset = { top: 0, left: 0, width: 0, height: 0 };
    offset.top = this.$root[0][0].offsetTop - that.config.changeBorder.horizontal.marginStart;
    offset.left = parseInt(d3.select(that.$root.node().parentNode).style('left')) - containerMarginLeft - that.config.changeBorder.vertical.marginStart + offsetToLeftBorder;
    offset.width = parseFloat(this.svg.attr('width'));
    offset.height = parseFloat(this.svg.attr('height'));

    var positions = d3.map();
    var kx = that.chartWidth / that.selectedNode.dx;
    var ky = that.chartHeight / that.selectedNode.dy;
    // calcuation is equal to the one in the zoom function
    this.nodePositions.forEach((d) => {
      positions.set(d.node.fqIname, {
        'x': that.xscale(d.x),
        'y': that.yscale(d.y),
        'width': Math.max(0.01, kx * d.dx),
        'height': (d.children) ? that.headerHeight : Math.max(0.01, ky * d.dy)
      });
    });
    //console.log(positions);

    this.config.changeBorder.replyLayoutCoordinates(infra, isFirstCall, positions, offset);
  }

  private initTreemap() {
    // prepare date first -> deletes already calculated treemap values
    this.prepareData();

    this.treemap = d3.layout.treemap()
      .size([this.chartWidth, this.chartHeight])
      .round(false)
      .sticky(true)
      .mode('squarify')
      .children(function children(d) { return d.children; });

    if (this.fullscreen) {
      this.treemap
        .size([this.chartFullWidth, this.chartFullHeight])
        .value((d) => this.size(d))
        .sort(function comparator(a, b) {
          // sort intermediate by name and children by size
          if (a.children || b.children) {
            var nameA = a.name.toLowerCase(), nameB = b.name.toLowerCase();
            if (nameA > nameB) //sort string ascending
              return -1;
            if (nameA < nameB)
              return 1;
            return 0; //default return value (no sorting)

          } else {
            return a.value - b.value; // sort by size/number
          }
        });

    } else {
      this.treemap
        .size([this.chartWidth, this.chartHeight])
        //.sort(null) // children have no sort function -> disable sorting
        .value((d) => this.count(d))
        .sort(function comparator(a, b) {
          var nameA = a.name.toLowerCase(), nameB = b.name.toLowerCase();
          if (nameA > nameB) //sort string ascending
            return -1;
          if (nameA < nameB)
            return 1;
          return 0; //default return value (no sorting)
          //return a.value - b.value; // sort by size/number
        });
    }
  }

  private initLayout() {
    var that = this;

    that.svg = that.$root.append('svg')
      .classed('pvd-treemap', true);

    that.chart = that.svg.append('g');
  }

  private prepareData() {
    var that = this;

    // prepare the data structure for treemap layout
    var data = {};
    var defaultColor = that.config.changeBorder.vertical.actToColor();
    function traverse(n: Node, parent) {
      var node = {
        'id': n.fqIname,
        'name': n.title,
        'node': n,
        'color': defaultColor
      };

      // flatten all levels after level 2
      if ((n.level <= that.numParentNodesLevel) || !n.has()) {
        if (parent.children === undefined) { parent.children = []; }
        that.nodesMap.set(node.id, node);
        parent.children.push(node);
      } else {
        node = parent;
      }

      n.children().forEach((c) => traverse(c, node));
    }
    traverse(that.infra.root, data);
    that.data = (<any>data).children[0];
    //console.log(that.data);
  }

  private draw() {
    var that = this;

    that.selectedNode = that.rootNode = that.data;
    that.nodePositions = that.treemap.nodes(that.rootNode);

    that.children = that.nodePositions.filter(function (d: any) {
      return !d.children;
    });
    that.parents = that.nodePositions.filter(function (d: any) {
      return d.children;
    });

    // create parent cells
    that.$parentCells = that.chart.selectAll('g.cell.parent')
      .data(that.parents, function (d) {
        return 'p-' + d.id;
      });

    function onNodeClick(d) {
      // exclude external and intermediate nodes
      if (d === that.rootNode || d.node === d.node.infrastructure.external) { return; }

      if (d.node.has()) { //intermediate node
        if (that.selectedSector === d) {
          that.selectedSector = undefined;
          that.config.selection.clearSelection();
        } else {
          that.selectedSector = d;
          that.config.selection.addBulkSelection(d.children.map((d) => d.node));
        }
      } else { //leaf
        //multi selection
        var additive = (<any>d3.event).ctrlKey || (<any>d3.event).shiftKey || (<any>d3.event).metaKey;
        var is = that.config.selection.isSelected(d.node);
        if (is) {
          if (additive) {
            that.config.selection.removeFromSelection(d.node);
          } else {
            that.config.selection.clearSelection();
          }
        } else if (additive) {
          that.config.selection.addToSelection(d.node);
        } else {
          that.config.selection.selection = d.node;
        }
      }
    }

    var parentEnterTransition = that.$parentCells.enter()
      .append('g')
      .attr('data-fqname', function (d) { return d.node.fqIname; })
      .attr('class', 'cell parent')
      .classed('root', (d) => d === that.rootNode)
      .on('click', onNodeClick)
      .on('dblclick', function (d) { // fullscreen on dbclick for rootnode in non-standalone mode
        if (d !== that.rootNode || that.isStandalone) { return; }
        that.fullscreen = !that.fullscreen;
        that.rescale();
        that.initTreemap();
        that.draw();
        //that.zoom(that.selectedNode);
      })
      .on('mouseover', function (d) {
        tooltip().mouseover(d.node.title);
      })
      .on('mousemove', (d) => {
        tooltip().update(d.node.title);
        tooltip().mousemove();
      })
      .on('mouseout', function () {
        tooltip().mouseout();
      });

    parentEnterTransition.append('rect')
      .attr('width', function (d) {
        return Math.max(0.01, d.dx);
      })
      .attr('height', that.headerHeight)
      .style('fill', function (d) {
        return that.color(d);
      });
    parentEnterTransition.append('foreignObject')
      .attr('class', 'foreignObject')
      .append('xhtml:body')
      .attr('class', 'labelbody')
      .append('div')
      .attr('class', 'nodelabel');

    var root = parentEnterTransition
      .filter((d) => d === that.rootNode) // only for root node
      .select('.labelbody')
      .append('ul')
      .classed('config', true);

    root.append('li').append('a')
      .style('color', function (d) {
        return idealTextColor(that.color(d));
      })
      .text((that.useDoiColoring) ? 'Color: DOI' : 'Color: sector')
      .on('click', function () {
        that.useDoiColoring = !that.useDoiColoring;
        d3.select(this).text((that.useDoiColoring) ? 'Color: DOI' : 'Color: sector');
      });

    root.append('li').append('a')
      .classed('hg-hidden', that.isStandalone) // hide in standalone mode
      .style('color', function (d) {
        return idealTextColor(that.color(d));
      })
      .text((that.isCollapsed) ? 'Expand' : 'Collapse')
      .on('click', function () {
        that.isCollapsed = !that.isCollapsed;
        that.svg.classed('collapsed', that.isCollapsed);
        that.svg.selectAll('.cell:not(.root)').style('display', that.isCollapsed ? 'none' : null);

        if (that.isCollapsed) {
          that.segmentRep.applyBehavior('treemapCollapse');
        } else {
          that.segmentRep.removeBehavior('treemapCollapse');
        }
        that.config.changeBorder.updateSegmentRep(that.segmentRep);

        d3.select(this).text((that.isCollapsed) ? 'Expand' : 'Collapse');
        that.rescale();
      });

    var offsetX = 0;
    var dragTreemap = d3.behavior.drag()
      .on('dragstart', function () {
        if (that.fullscreen) { return; }
        offsetX = (<any>d3.event.sourceEvent).offsetX;
        that.config.changeBorder.dragStart(that.config.changeBorder.vertical, 'horizontal');
      })
      .on('drag', function () {
        if (that.fullscreen) { return; }
        that.config.changeBorder.vertical.updateAllPos(d3.event.x - offsetX, that.segmentRep.vSegment);
        that.config.changeBorder.drag(that.config.changeBorder.vertical, 'horizontal');
      })
      .on('dragend', function () {
        if (that.fullscreen) { return; }
        that.config.changeBorder.dragEnd(that.config.changeBorder.vertical, 'horizontal');
      });

    // treemap is only draggable in conjunction with ThermalLayout
    if (that.isStandalone === false) {
      parentEnterTransition
        .filter((d) => d === that.rootNode)
        .select('.nodelabel')
        .classed('ew-draggable', true)
        .call(dragTreemap);
    }

    // update transition
    var parentUpdateTransition = that.$parentCells;//.transition().duration(that.transitionDuration);
    parentUpdateTransition.select('.cell')
      .attr('transform', function (d) {
        return 'translate(' + d.dx + ',' + d.y + ')';
      });
    parentUpdateTransition.select('rect')
      .attr('width', function (d) {
        return Math.max(0.01, d.dx);
      })
      .attr('height', that.headerHeight)
      .style('fill', function (d) {
        return that.color(d);
      });
    parentUpdateTransition.select('.foreignObject')
      .attr('width', function (d) {
        return Math.max(0.01, d.dx);
      })
      .attr('height', that.headerHeight)
      .select('.labelbody .nodelabel')
      .style('color', function (d) {
        return idealTextColor(that.color(d));
      })
      .text(function (d) {
        return d.name;
      });
    parentUpdateTransition
      .filter((d) => d === that.rootNode) // only for root node
      .select('.labelbody .switchColor')
      .style('color', function (d) {
        return idealTextColor(that.color(d));
      });
    // remove transition
    that.$parentCells.exit()
      .remove();

    // create children cells
    that.$childrenCells = that.chart.selectAll('g.cell.child')
      .data(that.children, function (d) {
        return 'c-' + d.id;
      });
    // enter transition
    var childEnterTransition = that.$childrenCells.enter()
      .append('g')
      .attr('data-fqname', function (d) { return d.node.fqIname; })
      .attr('class', 'cell child')
      .classed('crossed', (that.isStandalone)) // set the class manually without ThermalLayout usage
      .on('click', onNodeClick)
      .on('mouseover', function (d) {
        tooltip().mouseover(d.node.name);
        this.parentNode.appendChild(this); // workaround for bringing elements to the front (ie z-index)
        d3.select(this).classed('hover', true);
        that.config.selection.hover = d.node;
      })
      .on('mousemove', (d) => {
        tooltip().update((d.node.title !== '') ? d.node.name + ' - ' + d.node.title : d.node.name);
        tooltip().mousemove();
      })
      .on('mouseout', function () {
        tooltip().mouseout();
        d3.select(this).classed('hover', false);
        that.config.selection.hover = null;
      });
    childEnterTransition.append('rect')
      .classed('background', true)
      .style('fill', function (d) {
        return that.color(d);
      });
    childEnterTransition.append('foreignObject')
      .attr('class', 'foreignObject')
      .attr('width', function (d) {
        return Math.max(0.01, d.dx);
      })
      .attr('height', function (d) {
        return Math.max(0.01, d.dy);
      })
      .append('xhtml:body')
      .attr('class', 'labelbody')
      .append('div')
      .attr('class', 'nodelabel')
      .text(function (d) {
        return d.name;
      });

    if (that.supportsForeignObject) {
      childEnterTransition.selectAll('.foreignObject')
        .style('display', 'none');
    } else {
      childEnterTransition.selectAll('.foreignObject .labelbody .nodelabel')
        .style('display', 'none');
    }

    // update transition
    var childUpdateTransition = that.$childrenCells;//.transition().duration(that.transitionDuration);
    childUpdateTransition.select('.cell')
      .attr('transform', function (d) {
        return 'translate(' + d.x + ',' + d.y + ')';
      });
    childUpdateTransition.select('rect')
      .attr('width', function (d) {
        return Math.max(0.01, d.dx);
      })
      .attr('height', function (d) {
        return d.dy;
      })
      .style('fill', function (d) {
        return that.color(d);
      });
    childUpdateTransition.select('.foreignObject')
      .attr('width', function (d) {
        return Math.max(0.01, d.dx);
      })
      .attr('height', function (d) {
        return Math.max(0.01, d.dy);
      })
      .select('.labelbody .nodelabel')
      .text(function (d) {
        return d.name;
      });
    // exit transition
    that.$childrenCells.exit()
      .remove();

    that.zoom(that.selectedNode);
  }

  private size(d) {
    if (this.indexPointTs > 0 && d.node.getAttr('volume')) {
      var attrData = d.node.getAttr('volume').floor(this.indexPointTs);
      if (attrData !== null) {
        return attrData.v;
      } else {
        //console.log('no size value found for', d.node.name);
      }
    }
    return 1;
  }

  private count(d) {
    return 1;
  }

  //and another one
  private textHeight(d) {
    var that = this;

    var ky = that.chartHeight / d.dy;
    that.yscale.domain([d.y, d.y + d.dy]);
    return (ky * d.dy) / that.headerHeight;
  }

  private zoom(d) {
    var that = this;

    (<any>that.treemap)
      .padding([that.headerHeight / (that.chartHeight / d.dy), that.padding, that.padding, that.padding])
      .nodes(d);

    // moving the next two lines above treemap layout messes up padding of zoom result
    var kx = that.chartWidth / d.dx;
    var ky = that.chartHeight / d.dy;
    var level = d;

    that.xscale.domain([d.x, d.x + d.dx]);
    that.yscale.domain([d.y, d.y + d.dy]);

    if (that.selectedNode != level) {
      if (that.supportsForeignObject) {
        that.chart.selectAll('.cell.child .foreignObject')
          .style('display', 'none');
      } else {
        that.chart.selectAll('.cell.child .foreignObject .labelbody .label')
          .style('display', 'none');
      }
    }

    var zoomTransition = that.chart.selectAll('g.cell')//.transition().duration(that.transitionDuration)
      .attr('transform', function (d) {
        return 'translate(' + that.xscale(d.x) + ',' + that.yscale(d.y) + ')';
      })
      .each(function (d, i) {
        if (!i && (level !== this.root)) {
          that.chart.selectAll('.cell.child')
            .filter(function (d) {
              return d.parent === this.node; // only get the children for selected group
            })
            .select('.foreignObject .labelbody .label')
            .style('color', function (d) {
              return idealTextColor(that.color(d));
            });

          if (that.supportsForeignObject) {
            that.chart.selectAll('.cell.child')
              .filter(function (d) {
                return d.parent === this.node; // only get the children for selected group
              })
              .select('.foreignObject')
              .style('display', '');
          } else {
            that.chart.selectAll('.cell.child')
              .filter(function (d) {
                return d.parent === this.node; // only get the children for selected group
              })
              .select('.foreignObject .labelbody .label')
              .style('display', '');
          }
        }
      });

    zoomTransition.select('.foreignObject')
      .attr('width', function (d) {
        return Math.max(0.01, kx * d.dx);
      })
      .attr('height', function (d) {
        return d.children ? that.headerHeight : Math.max(0.01, ky * d.dy);
      })
      .select('.labelbody .label')
      .text(function (d) {
        return d.name;
      });

    // update the width/height of the rects
    zoomTransition.select('rect')
      .attr('width', function (d) {
        return Math.max(0.01, kx * d.dx);
      })
      .attr('height', function (d) {
        return d.children ? that.headerHeight : Math.max(0.01, ky * d.dy);
      });

    zoomTransition.filter((d) => d.children).select('rect')
      .attr('width', function (d) {
        return Math.max(0.01, kx * d.dx) - that.padding * 2;
      })
      .attr('transform', 'translate(' + that.padding + ',0)');

    that.selectedNode = d;

    if (d3.event && d3.event.hasOwnProperty('stopPropagation')) {
      d3.event.stopPropagation();
    }
  }

  layout(dt: number, now: number): any {

  }


  update(dt: number, now: number, layouted: any): void {
    var that = this;

    // calculate doi only for colors
    if (this.useDoiColoring) {
      var s = this.config.selection.getSelection(now);
      that.nodesMap.forEach((fqname, node) => {
        var act = compute(node.node, s, that.config.selection.doi);
        if (act === undefined) {
          return;
        }
        node.color = that.config.changeBorder.vertical.actToColor(act);
      });
    }

    that.chart.selectAll('g.cell')
      .select('rect')
      .style('fill', function (d) {
        return that.color(d);
      });

    that.chart.selectAll('.cell.parent')
      .select('.foreignObject .labelbody .nodelabel')
      .style('color', function (d) {
        return idealTextColor(that.color(d));
      });

    that.chart.selectAll('.cell.parent')
      .select('.foreignObject .labelbody .switchColor')
      .style('color', function (d) {
        return idealTextColor(that.color(d));
      });
  }

  private color(d): any {
    var color = this.headerColor;

    if (this.useDoiColoring) {
      //color = (d.children) ? this.headerColor : d.color;
      color = d.color;

    } else {
      color = (d.node === this.infra.root) ? this.headerColor : this.colorScale(d.name);

      if (!d.children) {
        color = this.colorScale(d.parent.name);
      }
    }

    // propagate color to HierarchyNode and its children
    d.node.color = color;

    return color;
  }

}


export default angular.module('directives.pvdTreemap', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorder
])
  .directive('pvdTreemap', function (
    pvdInfrastructureLoader: PVDInfrastructureLoader,
    pvdWindowResize: PVDWindowResize,
    $timeout,
    pvdAnimator: PVDAnimator,
    pvdDataSelection: PVDDataSelection,
    pvdInfrastructureMapper: PVDInfrastructureMapper,
    pvdLayoutManager: PVDLayoutManager,
    pvdTargetHierarchy: PVDTargetHierarchy,
    pvdChangeBorder: PVDChangeBorder
  ) {
    return {
      compile: function (element, attrs: any) {
        attrs.width = angular.isDefined(attrs.width) ? +attrs.width : '100%';
        attrs.height = angular.isDefined(attrs.height) ? +attrs.height : 500;
        attrs.numParentNodesLevel = angular.isDefined(attrs.numParentNodesLevel) ? +attrs.numParentNodesLevel : 2;
        attrs.isStandalone = (angular.isDefined(attrs.isStandalone) && attrs.isStandalone === 'true') ? true : false;

        return function ($scope, element) {
          pvdInfrastructureLoader.get(attrs.infraId).then((infrastructure: Infrastructure) => {
            $timeout(() => { //skip one time to ensure that the svg is properly layouted
              //var path:string = $scope.path;
              //var attr = infrastructure.findAttr(path);
              var $base = d3.select(element[0]);

              /*var $root:d3.Selection = $base.append('div')
                .classed('pvd-treemap', true)
                .attr('data-infra-id', attrs.infraId);*/

              var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
              config.visConfigId = attrs.visConfig || '';

              modifyConfig(config, infrastructure);

              new PVDTreemap($base, infrastructure, config, attrs.numParentNodesLevel, attrs.isStandalone);
            });
          });
        }
      },
      scope: {
        'infraId': '@?', // id of infrastructure*.json
        'width': '@?', // svg width
        'height': '@?', // svg individual height
        'visConfig': '@?', // modifier for infrastructure.visConfig[...]
        'numParentNodesLevel': '@?', // number of parent nodes before the whole child hierarchy will be flatten
        'isStandalone': '@?' // is the treemap used without the ThermalLayout directive? (default: false)
      },
      restrict: 'E'
    };
  })
  .name; // name for export default
