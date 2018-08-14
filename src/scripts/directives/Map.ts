/**
 * Created by Holger Stitz on 26.06.2015.
 */

import * as angular from 'angular';
import * as d3 from 'd3';
import Datamap from 'datamaps';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { compute } from '../models/DOI';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import Animator, { PVDAnimator, IAnimateable } from '../services/Animator';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import { modifyConfig, nextID, onDelete } from './VisUtils';
import { Node, Infrastructure } from '../models/Infrastructure';
import { ConstantAttribute } from '../models/Models';
import ChangeBorder, { SegmentRepresentation, PVDChangeBorder } from '../services/ChangeBorderService';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import DataService, { PVDDataService } from '../services/DataService';

/**
 *
 */
class PVDMap implements IAnimateable {
  private segmentRepVisConfigId = 'map';
  private segmentRep;

  private nodesMap: d3.Map<any> = d3.map(); // by fqIname
  private nodesMapByName: d3.Map<any> = d3.map(); // by title for countries
  private nodePositions: d3.Map<any> = d3.map();
  private lazyReplyLayoutCoords = false;

  private width = 0;
  private height = 0;
  private scale = 1;

  private $svg;
  private $overlay;
  private $header;
  private headerHeight = 25;
  private headerColor = '#fff'; // use 6 digits to calculate idealColor

  private datamap;

  private zoom = d3.behavior.zoom();

  private selectedState = null;
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
    '#393b79',
    '#5254a3',
    '#6b6ecf',
    '#9c9ede',
    //'#637939',
    //'#8ca252',
    //'#b5cf6b',
    //'#cedb9c',
    '#8c6d31',
    '#bd9e39',
    '#e7ba52',
    '#e7cb94',
    //'#843c39',
    //'#ad494a',
    //'#d6616b',
    //'#e7969c',
    '#7b4173',
    '#a55194',
    '#ce6dbd',
    '#de9ed6',
  ]); //d3.scale.category10();


  constructor(private $root, private infra: Infrastructure, private config: PVDHierarchyConfig, private attrs, private dataService) {
    this.segmentRep = this.config.changeBorder.getSegmentRepByVisConfigId(this.segmentRepVisConfigId);
    this.attachListener();
    this.initLayout();
    this.prepareData();
  }

  private attachListener() {
    var that = this;

    var id = '.map' + nextID();

    // window resize is triggered via changeBorder.maxsize
    /*this.config.windowResize.on('change'+id, () => {
     that.rescale();
     that.zoom(that.selectedNode);
     });*/

    this.config.changeBorder.on('crossed' + id, (node: Node, newSegmentRep: SegmentRepresentation) => {
      if (node === undefined || newSegmentRep === undefined) { return; }

      if (that.attrs.nodesAre === 'countries') {
        that.$svg.selectAll('.datamaps-subunit').filter((d) => {
          var country = that.nodesMapByName.get(that.getCountryName(d.properties.name)), selected = false;
          if (country !== undefined) {
            return that.nodesMapByName.get(that.getCountryName(d.properties.name)).node === node;
          } else {
            return false;
          }
        }).classed('crossed', (newSegmentRep.isHidden('Map')));

      } else {
        if (newSegmentRep.isHidden('Map')) {
          that.$svg.selectAll('.datamaps-bubble').filter((d) => d.id === node.fqIname).classed('crossed', true);
        } else {
          that.$svg.selectAll('.datamaps-bubble').filter((d) => d.id === node.fqIname).classed('crossed', false);
        }
      }
    });

    this.config.changeBorder.on('maxsize' + id, () => {
      that.width = that.config.changeBorder.vertical.maxSize + that.config.changeBorder.vertical.marginStart + that.config.changeBorder.vertical.marginEnd + 1;
      that.height = that.config.changeBorder.horizontal.maxSize + that.config.changeBorder.horizontal.marginStart + that.config.changeBorder.horizontal.marginEnd + 1 - 15;

      that.rescale();
    });

    this.config.changeBorder.on('drag' + id, (border, orientation) => {
      if (orientation === 'horizontal') {
        that.rescale();
      }
    });

    this.config.changeBorder.on('req_layout_coord' + id, (infra, firstCall) => {
      var r = that.replyLayoutCoords(infra, firstCall);

      if (r === undefined && firstCall) {
        that.lazyReplyLayoutCoords = true;
      }
    });

    this.config.selection.on('selectall' + id, (newNode, allNodes, oldNodes) => {
      that.$svg.classed('selection-enabled', (allNodes.length > 0));

      if (that.attrs.nodesAre === 'countries') {
        that.$svg.selectAll('.datamaps-subunit').each(function (d) {
          var country = that.nodesMapByName.get(that.getCountryName(d.properties.name)), selected = false;
          if (country !== undefined) {
            selected = (allNodes.indexOf(country.node) > -1);
          }
          d3.select(this).classed('selected', selected);
        });

      } else {
        that.$svg.selectAll('.datamaps-bubble').each(function (d) {
          d3.select(this).classed('selected', (allNodes.indexOf(that.nodesMap.get(d.id).node) > -1))
        });
      }

    });

    this.config.animator.push(this);
    onDelete(this.$root, () => {
      this.config.animator.remove(this);
      this.config.selection.on('selectall' + id, null);
      this.config.changeBorder.on('maxsize' + id, null);
      this.config.changeBorder.on('drag' + id, null);
      this.config.changeBorder.on('crossed' + id, null);
      this.config.changeBorder.on('req_layout_coord' + id, null);
    });
  }

  private rescale() {
    var that = this,
      offsetToLeftBorder = 1,
      offsetToTop = 11,
      left = 15, // padding-left of outer .col-md-9
      centerRange = that.config.changeBorder.vertical.posRangeBySegment(that.segmentRep.vSegment) || [0, that.config.gridWidth];

    that.width = centerRange[1] - centerRange[0] - offsetToLeftBorder;
    that.height = that.config.changeBorder.horizontal.maxSize + that.config.changeBorder.horizontal.marginStart - offsetToTop;
    left += centerRange[0] +
      offsetToLeftBorder +
      that.config.changeBorder.vertical.marginStart;

    var h = that.config.changeBorder.horizontal.maxSize;

    that.$svg.attr('width', that.width); //.attr('height', that.height);
    that.$root.style('width', that.width + 'px');

    var prefix = '-webkit-transform' in document.body.style ? '-webkit-' : '-moz-transform' in document.body.style ? '-moz-' : '-ms-transform' in document.body.style ? '-ms-' : '',
      newsize = that.width * 1.3,
      oldsize = that.$svg.attr('data-width');

    that.scale = (newsize / oldsize);

    //that.$svg.selectAll('g').attr('transform', 'translate(-'+(that.width * .14)+')scale(' + that.scale + ')');
    //that.datamap.resize();

    //if(that.$svg.attr('data-height') === null) {
    //  that.$svg.attr('data-height', +h);
    //}

    that.$svg
      .attr('height', +h);
    //.style('top', (that.config.changeBorder.horizontal.centerAbsPos() - (that.$svg.attr('height') / 2)) - offsetToTop + 'px');

    that.$overlay.attr('width', that.width).attr('height', h);

    that.$root
      .style('left', left + 'px')
      .style('top', offsetToTop + 'px');

    that.$root.style('height', ((that.isCollapsed) ? that.headerHeight : h) + 'px');
  }

  private appendHeader() {
    var that = this;

    if (that.attrs.showHeader === false || that.attrs.showHeader === "false") {
      return;
    }

    that.$header = that.$root.append('div')
      .classed('map-header', true)
      //.style('background-color', that.headerColor)
      .style('height', that.headerHeight + 'px')
      .append('div')
      .attr('class', 'nodelabel');

    var root = that.$header
      .append('ul')
      .classed('config', true);

    if (that.attrs.switchColorLink === "true") {
      root.append('li').append('a')
        //.style('color', idealTextColor(that.headerColor))
        .text((that.useDoiColoring) ? 'Color: DOI' : 'Color: State')
        .on('click', function () {
          (<Event>d3.event).stopPropagation();
          that.useDoiColoring = !that.useDoiColoring;
          d3.select(this).text((that.useDoiColoring) ? 'Color: DOI' : 'Color: State');
        });
    }

    root.append('li').append('a')
      //.style('color', idealTextColor(that.headerColor))
      .text((that.isCollapsed) ? 'Expand' : 'Collapse')
      .on('click', function () {
        (<Event>d3.event).stopPropagation();
        that.isCollapsed = !that.isCollapsed;
        that.$root.classed('collapsed', that.isCollapsed);

        if (that.isCollapsed) {
          that.segmentRep.applyBehavior('treemapCollapse');
        } else {
          that.segmentRep.removeBehavior('treemapCollapse');
        }
        that.config.changeBorder.updateSegmentRep(that.segmentRep);

        d3.select(this).text((that.isCollapsed) ? 'Expand' : 'Collapse');
        that.rescale();
      });
  }

  private initLayout() {
    var that = this;

    that.appendHeader();

    var options: any = {
      element: that.$root[0][0],
      scope: that.attrs.mapScope || 'usa',
      //responsive: true,
      geographyConfig: {
        //highlightOnHover: false,
        //popupOnHover: false,
        highlightBorderWidth: 0.3,
        highlightBorderColor: '#fee090'
      },
      fills: {
        defaultFill: '#E6E6E6',
        bubbles: '#ccc'
      },
      bubblesConfig: {
        fillOpacity: 1,
        highlightBorderWidth: 0
      }
      //projection: 'mercator'
    };

    if (that.attrs.mapScope !== 'usa') {
      options.projection = 'mercator';
    }

    that.datamap = new Datamap(options);

    that.$svg = that.$root.select('svg.datamap');

    var datamapsMouseOverFnc = that.$svg.selectAll('.datamaps-subunit').on('mouseover'),
      datamapsMouseOutFnc = that.$svg.selectAll('.datamaps-subunit').on('mouseout');

    that.$svg.selectAll('.datamaps-subunit')
      .on('mouseover', function (d) {
        if (that.attrs.nodesAre === 'countries') {
          var country = that.nodesMapByName.get(that.getCountryName(d.properties.name));
          if (country !== undefined) {
            that.config.selection.hover = country.node;
          }
          var color = d3.select(this).style('fill'),
            scale = that.$svg.attr('data-scale') || (that.attrs.initScale || 1);
          datamapsMouseOverFnc.call(this, d);
          d3.select(this).style('fill', color).style('stroke-width', 2 / scale);
          // set as last dom element to display as front
          this.parentNode.appendChild(this);
        }
      })
      .on('mouseout', function (d) {
        if (that.attrs.nodesAre === 'countries') {
          that.config.selection.hover = null;
        }
        var color = d3.select(this).style('fill'),
          scale = that.$svg.attr('data-scale') || (that.attrs.initScale || 1);
        datamapsMouseOutFnc.call(this, d);
        d3.select(this).style('fill', color).style('stroke-width', 1 / scale);
      })
      .on('click', function (d) {
        (<Event>d3.event).stopPropagation();
        if (that.attrs.nodesAre === 'countries') {
          var country = that.nodesMapByName.get(that.getCountryName(d.properties.name));
          if (country !== undefined) {
            country = country.node;
          } else {
            return;
          }

          //multi selection
          var additive = (<any>d3.event).ctrlKey || (<any>d3.event).shiftKey || (<any>d3.event).metaKey;
          var is = that.config.selection.isSelected(country);
          if (is) {
            if (additive) {
              that.config.selection.removeFromSelection(country);
            } else {
              that.config.selection.clearSelection();
            }
          } else if (additive) {
            that.config.selection.addToSelection(country);
          } else {
            that.config.selection.selection = country;
          }

        } else {
          // exclude external and intermediate nodes
          //if(d === that.rootNode || d.node === d.node.infrastructure.external) { return; }
          if (that.selectedState === d) {
            that.selectedState = undefined;
            that.config.selection.clearSelection();
          } else {
            that.selectedState = d;
            var selectedStations = that.nodesMap.values().filter((n) => {
              return ((<string>n.id).indexOf(d.properties.name) > -1);
            });
            that.config.selection.addBulkSelection(selectedStations.map((d) => d.node));
          }
        }
      });

    d3.select(that.$root.node().parentNode.parentNode)
      .on('click', function () {
        (<Event>d3.event).stopPropagation();
        that.selectedState = undefined;
        that.config.selection.clearSelection();
      });

    that.$overlay = that.$svg.insert('rect', ':first-child') // insert as first child
      .attr('class', 'overlay')
      .attr('width', that.width)
      .attr('height', that.height);

    if (that.attrs.zoomable === 'true' || that.attrs.zoomable === true) {
      var initScale = this.attrs.initScale || 1,
        initTranslate = this.attrs.initTranslate || '0,0';

      that.$svg.attr('data-scale', initScale);
      that.$svg.selectAll('g').attr('transform', 'translate(' + initTranslate + ')scale(' + initScale + ')')
      that.$svg.selectAll('path').style('stroke-width', 1 / initScale);

      that.zoom.scaleExtent([1, 10])
        .scale(initScale)
        .translate(initTranslate.split(','))
        .on('zoom', function move() {
          var t = (<any>d3.event).translate;
          var s = (<any>d3.event).scale;
          that.$svg.attr('data-scale', s);
          // constrain the map
          //var h = that.height / 3;
          //t[0] = Math.min(that.width / 2 * (s - 1), Math.max(that.width / 2 * (1 - s), t[0]));
          //t[1] = Math.min(that.height / 2 * (s - 1) + h * s, Math.max(that.height / 2 * (1 - s) - h * s, t[1]));
          //that.zoom.translate(t);
          that.$svg.selectAll('g').attr('transform', 'translate(' + t + ')scale(' + s + ')');
          that.$svg.selectAll('path').style('stroke-width', 1 / s);
        });

      that.$overlay.call(that.zoom);
      that.$svg.call(that.zoom); // add zoom also to svg to make countries draggable too
    }
  }

  prepareData() {
    var that = this;

    that.dataService.when('constantsLoaded').then(() => {
      var defaultColor = that.config.changeBorder.vertical.actToColor(),
        state,
        locations = [];

      function traverseCountries(n: Node, parent) {
        var node = parent;
        if (!n.has()) {
          node = {
            id: n.fqIname,
            name: n.title,
            node: n
          };
          that.nodesMap.set(node.id, node);
          that.nodesMapByName.set(node.name, node);
        }
        n.children().forEach((c) => traverseCountries(c, node));
      }

      function traverseUSA(n: Node, parent) {
        var node;
        // get the states (one level after root)
        if ((n.level < 3)) {
          state = n.name;
        } else {
          node = parent;
        }

        if (!n.has()) {
          node = {
            id: n.fqIname,
            name: n.title,
            radius: 1,
            state: state,
            latitude: (<ConstantAttribute<any>>n.getAttr('latitude')).getValue(),
            longitude: (<ConstantAttribute<any>>n.getAttr('longitude')).getValue(),
            fillKey: 'bubbles',
            borderWidth: 0,
            color: defaultColor
          };
          locations.push(node);

          // extra node to prevent circular structure that can't be resolve by datamap (JSON.stringify)
          var node2 = {
            id: n.fqIname,
            name: n.title,
            state: state,
            node: n
          };
          that.nodesMap.set(node.id, node2);
        }

        n.children().forEach((c) => traverseUSA(c, node));
      }

      if (that.attrs.nodesAre === 'countries') {
        traverseCountries(that.infra.root, {});

      } else {
        traverseUSA(that.infra.root, {});
        that.datamap.bubbles(locations);
      }
      that.rescale();

      var svgClientRect = that.$svg.node().getBoundingClientRect();

      if (that.attrs.nodesAre === 'countries') {
        // do something special for countries...

      } else {
        that.$svg.selectAll('.datamaps-bubble')
          .on('click', function (d) {
            (<Event>d3.event).stopPropagation();
            //multi selection
            var additive = (<any>d3.event).ctrlKey || (<any>d3.event).shiftKey || (<any>d3.event).metaKey;
            var is = that.config.selection.isSelected(that.nodesMap.get(d.id).node);
            if (is) {
              if (additive) {
                that.config.selection.removeFromSelection(that.nodesMap.get(d.id).node);
              } else {
                that.config.selection.clearSelection();
              }
            } else if (additive) {
              that.config.selection.addToSelection(that.nodesMap.get(d.id).node);
            } else {
              that.config.selection.selection = that.nodesMap.get(d.id).node;
            }
          })
          .each(function (d) {
            var clientRect = this.getBoundingClientRect();
            that.nodePositions.set(d.id, {
              x: clientRect.left - svgClientRect.left,
              y: clientRect.top - svgClientRect.top,
              height: (2 * d.radius) * that.scale,
              width: (2 * d.radius) * that.scale
            });
          });
      }
    });
  }

  private replyLayoutCoords(infra, isFirstCall) {
    var that = this;
    if (that.infra !== infra || that.nodePositions === undefined) { return; }

    var offsetToLeftBorder = 1,
      containerMarginLeft = 15; // padding-left of outer .col-md-9

    var offset = { top: 0, left: 0, width: 0, height: 0 };
    offset.top = this.$root[0][0].offsetTop - that.config.changeBorder.horizontal.marginStart;
    offset.left = parseInt(that.$root.style('left')) - containerMarginLeft - that.config.changeBorder.vertical.marginStart + offsetToLeftBorder;
    offset.width = parseFloat(this.$svg.attr('width'));
    offset.height = parseFloat(this.$svg.attr('height'));

    this.config.changeBorder.replyLayoutCoordinates(infra, isFirstCall, that.nodePositions, offset);
  }

  layout(dt: number, now: number): any {

  }


  update(dt: number, now: number, layouted: any): void {
    var that = this;
    var changedColor = false;

    // calculate doi only for colors
    if (this.useDoiColoring) {
      var s = this.config.selection.getSelection(now);
      that.nodesMap.forEach((fqname, d) => {
        var act = compute(d.node, s, that.config.selection.doi);
        if (act === undefined) {
          return;
        }
        changedColor = (changedColor === false && d.node.color !== that.config.changeBorder.vertical.actToColor(act));
        d.node.color = that.config.changeBorder.vertical.actToColor(act);
      });
    } else {
      that.nodesMap.forEach((fqname, d) => {
        changedColor = (changedColor === false && d.node.color !== this.colorScale(d.state));
        d.node.color = this.colorScale(d.state);
      });
    }

    if (changedColor === false) {
      return;
    }

    if (that.attrs.nodesAre === 'countries') {
      that.$svg.selectAll('.datamaps-subunit')
        .style('fill', function (d) {
          var country = that.nodesMapByName.get(that.getCountryName(d.properties.name));
          return (country !== undefined) ? country.node.color : that.datamap.options.fills.defaultFill;
        });

    } else {
      that.$svg.selectAll('.datamaps-bubble')
        .style('fill', function (d) {
          return that.nodesMap.get(d.id).node.color;
        });
    }
  }

  private getCountryName(name) {
    // execeptions in spelling between Datamap polygons and infrastructure.json
    switch (name) {
      case 'United States of America': name = 'United States'; break;
    }
    return name;
  }

}

export default angular.module('directives.pvdMap', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorder,
  DataService
])
  .directive('pvdMap', [
    'pvdInfrastructureLoader',
    'pvdWindowResize',
    '$timeout',
    'pvdAnimator',
    'pvdDataSelection',
    'pvdInfrastructureMapper',
    'pvdLayoutManager',
    'pvdTargetHierarchy',
    'pvdChangeBorder',
    'pvdDataService',
    function (
      pvdInfrastructureLoader: PVDInfrastructureLoader,
      pvdWindowResize: PVDWindowResize,
      $timeout,
      pvdAnimator: PVDAnimator,
      pvdDataSelection: PVDDataSelection,
      pvdInfrastructureMapper: PVDInfrastructureMapper,
      pvdLayoutManager: PVDLayoutManager,
      pvdTargetHierarchy: PVDTargetHierarchy,
      pvdChangeBorder: PVDChangeBorder,
      pvdDataService: PVDDataService
    ) {
      return {
        compile: function (element, attrs: any) {
          attrs.width = angular.isDefined(attrs.width) ? +attrs.width : '100%';
          attrs.height = angular.isDefined(attrs.height) ? +attrs.height : 500;

          return function ($scope, element) {
            pvdInfrastructureLoader.get(attrs.infraId).then((infrastructure: Infrastructure) => {
              $timeout(() => { //skip one time to ensure that the svg is properly layouted
                //var path:string = $scope.path;
                //var attr = infrastructure.findAttr(path);
                var $base = d3.select(element[0]);

                var $root: d3.Selection<any> = $base.append('div')
                  .classed('pvd-map', true)
                  .attr('data-infra-id', attrs.infraId)
                  .style({
                    'position': 'absolute',
                    'width': 500,
                    'height': 300
                  });

                var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
                config.visConfigId = attrs.visConfig || '';

                modifyConfig(config, infrastructure);

                new PVDMap($root, infrastructure, config, attrs, pvdDataService);
              });
            });
          }
        },
        scope: {
          'mapScope': '@?', // usa [default] || world
          'nodesAre': '@?', // countries || cities (have "latitude" and "longitude" attribute) [default]
          'infraId': '@?', // id of infrastructure*.json
          'width': '@?', // svg width
          'height': '@?', // svg individual height
          'visConfig': '@?', // modifier for infrastructure.visConfig[...],
          'showHeader': '@?', // true [default] || false
          'switchColorLink': '@?', // true [default] || false
          'initTranslate': '@?', // map translation for zoom behavior, e.g. '421.483,4891.294'; default: '0,0'
          'initScale': '@?', // map scale for zoom behavior, e.g. '2.212'; default: '1',
          'zoomable': '@?' // true || false
        },
        restrict: 'E'
      };
    }])
  .name; // name for export default

