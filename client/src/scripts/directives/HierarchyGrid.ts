/**
 * Created by Holger Stitz on 18.08.2014.
 */

import * as angular from 'angular';
import * as d3 from 'd3';
import { PVDAHierarchyGrid } from './AHierarchyGrid';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { Node, Infrastructure } from '../models/Infrastructure';
import { onDelete, modifyConfig, nextID, tooltip } from './VisUtils';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import Animator, { PVDAnimator } from '../services/Animator';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import { PVDGridLayout } from './layouts/GridLayout';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager, PVDHierarchyLayoutConfig } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import ChangeBorderService, { PVDChangeBorder } from '../services/ChangeBorderService';

'use strict';


// render the nodes according to computed layout
export class PVDHierarchyGrid extends PVDAHierarchyGrid {
  private roots: Node[] = [];

  private $dragNode: d3.Selection<any> = null;

  private id = '.grid' + nextID();

  constructor($root, private infra: Infrastructure, config: PVDHierarchyConfig, private hierarchiesDown: number = 0) {
    super($root, config);
    this.config.mode = 'selection-target';
    if (config.nodeWidth > 0) {
      this.config.selection.nodeWidth = config.nodeWidth;
    }
    this.config.selection.infra = infra;
    this.attachListener();

    //if we are the small multiple, just show a single time step
    this.$dragNode = d3.select('body').append('div').classed('hg-node hg-drag-node', true);

    this.init(infra, 'infra');
  }

  private init(infra: Infrastructure, event: string): void {
    // if infra changed, remove old listener and add one to new infra
    if (this.infra !== infra) {
      this.infra.on('addNode.' + this.id, null);

      // initialize layout again and add the new node to DOM
      infra.on('addNode' + this.id, (newNode) => {
        this.layouter.initNodes(null, infra.root);
        this.createNode(newNode);
        this.relayout('update');
      });
    }

    this.infra = infra;

    if (this.$root === null) {
      return;
    }

    // hide tooltip after hierarchy change
    tooltip().hide();

    // delete everything
    this.$root.selectAll(':not(.hg-edge-overlay)').remove();
    this.$root
      .attr('data-infra-id', infra.id)
      .classed('infra-' + infra.id, true)
      .classed('color-' + infra.color, true);

    modifyConfig(this.config, infra);

    this.roots = [];
    this.roots.push(infra.root);

    var layoutConfig = this.config.layout.getLayoutConfig(infra.id);
    if (layoutConfig !== null && layoutConfig !== undefined) {
      this.config.autoShrink = layoutConfig.autoShrink;
      this.config.triggerActivity = (layoutConfig.sortBy === 'activity');
    }
    this.layouter = this.config.layout.getLayoutByHierarchyId(this.infra.id);

    if (this.layouter === null) {
      this.layouter = this.config.layout.getLayoutById(PVDGridLayout.ID);
    }

    this.layouter.targetHierarchy = this.config.targetHierarchy;
    this.layouter.initNodes(null, infra.root);

    this.createNode(this.infra.external);
    var that = this, h = this.config.targetHierarchy.hierarchy;
    function traverse(n: Node, level) {
      that.createNode(n);
      n.children().forEach((c) => traverse(c, level));
      if (level < that.hierarchiesDown) {
        var next = h[h.indexOf(n.infrastructure.id) + 1];
        n.getMappings(next).forEach((c) => traverse(c, level + 1));
      }
    }
    traverse(this.infra.root, 0);

    {
      var target = this.config.targetHierarchy.targetFromInfra(true, infra);
      if (target.length > 0) {
        this.inlayUp = this.createInlayUp();
      } else {
        this.inlayUp = null;
      }
      target = this.config.targetHierarchy.targetFromInfra(false, infra);
      if (target.length > 0) {
        this.inlayDown = this.createInlayDown();
      } else {
        this.inlayDown = null;
      }
    }

    this.relayout(event);
  }

  private nextMapping(node: Node) {
    if (this.hierarchiesDown <= 0) {
      return null;
    }
    var i = node.infrastructure;
    return this.config.targetHierarchy.next(i.id);
  }

  hasChildrenCb(node: Node): boolean {
    if (this.hierarchiesDown === 0) {
      return super.hasChildrenCb(node);
    }
    var n = this.nodesMap.get(node.fqIname);
    if (n.collapsed) {
      return false;
    }
    if (n.hasNodeChildren()) {
      return true;
    }
    var m = this.nextMapping(node);
    if (m) {
      return node.getMappings(m).length > 0;
    }
  }

  parentCb(node: Node): Node {
    if (node === this.layouter.rootNode) {
      return null;
    }
    var i = node.infrastructure;
    if (i === this.infra) {
      return node.parent;
    }
    //check mapping
    var m = this.config.targetHierarchy.previous(i.id);
    return node.getMappings(m)[0];
  }

  parentsCb(node: Node): Node[] {
    if (node === this.layouter.rootNode) {
      return [node];
    }
    var i = node.infrastructure;
    if (i === this.infra) {
      return node.parents;
    }
    //check mapping
    var m = this.config.targetHierarchy.previous(i.id);
    var p = node.getMappings(m)[0];
    if (p) {
      var ps = this.parentsCb(p);
      ps.unshift(node);
      return ps;
    }
  }

  childrenCb(node: Node): Node[] {
    var n = this.nodesMap.get(node.fqIname);

    var c = n.nodeChildren();

    var m = this.nextMapping(node);
    if (m) {
      c = c.concat(node.getMappings(m));
    }
    if (this.config.triggerActivity) {
      return c.sort((a, b) => {
        if (a.master === b.master) {
          //
          return d3.descending(d3.round(this.nodesMap.get(a.fqIname).activity, 1), d3.round(this.nodesMap.get(b.fqIname).activity, 1));
        }
        return a.master ? -1 : +1;
      });
    } else {
      return c;
    }
  }

  private attachListener(): void {
    var that = this;

    this.config.windowResize.on('change' + this.id, () => this.relayout('resize'));

    // transfer the hover to other hierarchies
    this.config.selection.on('hover' + this.id, (newNode: Node, oldNode: Node) => {
      if (newNode !== null && this.nodesMap.has(newNode.fqIname)) {
        this.nodesMap.get(newNode.fqIname).$node.classed('hg-hover', true);
      }

      if (oldNode !== null && this.nodesMap.has(oldNode.fqIname)) {
        this.nodesMap.get(oldNode.fqIname).$node.classed('hg-hover', false);
      }
    });

    // select node and show inlay if necessary
    function getNodePos(node: Node) {
      var n = that.nodesMap.get(node.fqIname);
      return n ? n.position() : { x: 0, y: 0 };
    }

    // init selection source and target
    {
      this.config.layout.on('layout' + this.id, (layoutConfig: PVDHierarchyLayoutConfig) => {
        if (this.infra.id !== layoutConfig.infra.id) { return; }
        // the config update is done in this.init()
        //this.config.triggerActivity = (layoutConfig.sortBy === 'activity');
        //this.config.autoShrink = layoutConfig.autoShrink;

        this.init(this.infra, 'layout');
      });

      this.config.layout.on('nodes' + this.id, (layoutConfig: PVDHierarchyLayoutConfig) => {
        if (this.infra.id !== layoutConfig.infra.id || this.layouter.id !== layoutConfig.layoutId) { return; }

        this.config.triggerActivity = (layoutConfig.sortBy === 'activity');
        this.config.autoShrink = layoutConfig.autoShrink;

        this.nodesMap.forEach((fqname, node) => {
          node.setScaleFactor(0, this.config.act2width(this.config.autoShrink ? node.activity : 1));
        });

        this.relayout('nodes');
      });

      this.config.selection.on('infra' + this.id,
        (newInfra: Infrastructure, oldInfra: Infrastructure) => {
          if (oldInfra !== null) {
            this.$root.classed('infra-' + oldInfra.id, false)
              .classed('color-' + oldInfra.color, false);
          }
          if (newInfra !== null) {
            this.$root.classed('infra-' + newInfra.id, true)
              .classed('color-' + newInfra.color, true);

            this.init(newInfra, 'infra');
          }
        }
      );
      this.config.selection.on('nodeWidth' + this.id, () => this.updateWidths());
      this.config.selection.on('selectall' + this.id + '-2', (newNode: Node, all: Node[], prev: Node[]) => {
        if (this.inlayUp !== null) {
          this.inlayUp.updateSelection(all, getNodePos);
        }
        if (this.inlayDown !== null) {
          this.inlayDown.updateSelection(all, getNodePos);
        }

        prev.forEach((p) => {
          var f = p.fqIname;
          if (this.nodesMap.has(f)) {
            this.nodesMap.get(f).selected = false;
          }
        });

        var newInfra = this.infra;
        all.forEach((p) => {
          var f = p.fqIname;
          newInfra = p.infrastructure;
          if (this.nodesMap.has(f)) {
            this.nodesMap.get(f).selected = true;
          }
        });

        // change infra selection and re-select the nodes
        if (this.infra !== newInfra) {
          this.config.selection.infra = newInfra;
          this.config.selection.clearSelection();
          all.forEach((p) => {
            this.config.selection.addToSelection(p);
          });

        } else {
          this.relayout('selectall');
        }
      }
      );

      this.config.selection.on('dragStart' + this.id,
        (node: Node) => {
          //console.log('dragStart', node.fqIname, d3.event.sourceEvent.clientX, d3.event.sourceEvent.clientY);
          this.$dragNode
            .attr('class', 'hg-node hg-drag-node infra-' + node.infrastructure.id + ' color-' + node.infrastructure.color)
            .style({
              'display': 'none',
              'left': (<any>d3.event).sourceEvent.clientX + 'px',
              'top': (<any>d3.event).sourceEvent.clientY + 'px'
            });
        }
      );

      this.config.selection.on('drag' + this.id, () => {
        this.$root.classed('hg-dragging', true);

        this.$dragNode.style({
          'display': 'block',
          'left': (<any>d3.event).sourceEvent.clientX + 'px',
          'top': (<any>d3.event).sourceEvent.clientY + 'px'
        });
      }
      );

      this.config.selection.on('dragEnd' + this.id,
        (node: Node) => {
          this.$root.classed('hg-dragging', false);
          this.$dragNode
            .classed('infra-' + node.infrastructure.id, false)
            .classed('color-' + node.infrastructure.color, false)
            .style({
              'display': 'none'
            });

          if (this.config.selection.hover !== null) {
            var dropped = this.config.selection.hover;
            var targetinf = dropped.infrastructure.id;
            var sourceinf = node.infrastructure.id;
            if (this.config.targetHierarchy.hierarchy.indexOf(targetinf) != this.config.targetHierarchy.hierarchy.indexOf(sourceinf) - 1) {
              console.warn('can\'t drag node from ' + sourceinf + ' and drop on ' + targetinf);
              return; //can't update
            }
            if (dropped.has()) {
              console.warn('can\'t drop ' + node.fqIname + ' on intermediate node ' + dropped.fqIname);
              return; //can't map to intermediate node
            }
            console.log('dropped', node.fqIname, 'on', this.config.selection.hover.fqIname, 'at', (<any>d3.event).sourceEvent.clientX, (<any>d3.event).sourceEvent.clientY);
            var sourcem = node.getMappings(targetinf);
            var old = sourcem[0]; //assuming just one in the upper hierarchy
            old.removeMapping(sourceinf, node);
            sourcem[0] = dropped;
            dropped.addMapping(sourceinf, node);

            if (this.inlayUp !== null) {
              this.inlayUp.updateSelection(this.config.selection.selections, getNodePos);
            }
            if (this.inlayDown !== null) {
              this.inlayDown.updateSelection(this.config.selection.selections, getNodePos);
            }

            //dump the current mappings in pretty printed json
            //console.log(JSON.stringify(this.config.mapper.dump('s','vm').concat(this.config.mapper.dump('vm','b')),null,'\t'));

            this.relayout('dragEnd');
          }
        }
      );
    }

    this.config.animator.push(this);
    onDelete(this.$root, () => {
      this.config.animator.remove(this);
      this.config.windowResize.on('change' + this.id, null);
      this.config.selection.on('hover' + this.id, null);
      this.config.selection.on('selectall' + this.id, null);
      {
        this.config.layout.on('layout' + this.id, null);
        this.config.layout.on('nodes' + this.id, null);
        this.config.selection.on('infra' + this.id, null);
        this.config.selection.on('past' + this.id, null);
        this.config.selection.on('nodeWidth' + this.id, null);
        this.config.selection.on('selectall' + this.id + '-2', null);
        this.config.selection.on('dragStart' + this.id, null);
        this.config.selection.on('drag' + this.id, null);
        this.config.selection.on('dragEnd' + this.id, null);
      }
    });
  }

  focusOn(newroot: Node) {
    if (this.roots[this.roots.length - 1] === newroot) {
      if (this.roots.length === 1) { return; }

      this.roots.pop();
      newroot = this.roots[this.roots.length - 1];

    } else {
      this.roots.push(newroot);
    }

    this.layouter.rootNode = newroot;
    this.relayout('focus');
  }
}

export default angular.module('pipesVsDamsApp', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorderService
])
  .directive('pvdHierarchyGrid', [
    'pvdInfrastructureLoader',
    'pvdWindowResize',
    '$timeout',
    'pvdAnimator',
    'pvdDataSelection',
    'pvdInfrastructureMapper',
    'pvdLayoutManager',
    'pvdTargetHierarchy',
    'pvdChangeBorder',
    function (
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
        controller: function ($scope) {
        },
        compile: function (element, attrs: any) {
          attrs.datatype = angular.isDefined(attrs.datatype) ? attrs.datatype : 'stream';
          attrs.autoSize = (!angular.isDefined(attrs.width) && !angular.isDefined(attrs.height));
          attrs.width = angular.isDefined(attrs.width) ? +attrs.width : '100%';
          attrs.height = angular.isDefined(attrs.height) ? +attrs.height : 500;
          attrs.sliceWidth = angular.isDefined(attrs.sliceWidth) ? +attrs.sliceWidth : 20;
          attrs.sliceHeight = angular.isDefined(attrs.sliceHeight) ? +attrs.sliceHeight : 20;
          attrs.hierarchiesDown = angular.isDefined(attrs.hierarchiesDown) ? +attrs.hierarchiesDown : 0;

          return function ($scope, element) {
            pvdInfrastructureLoader.get(attrs.infraId).then((infrastructure: Infrastructure) => {
              $timeout(() => { //skip one time to ensure that the svg is properly layouted

                //var path:string = $scope.path;
                //var attr = infrastructure.findAttr(path);
                var $base = d3.select(element[0]);

                pvdDataSelection.infra = infrastructure;

                var $root: d3.Selection<any> = $base.append('div')
                  .classed('hg-grid', true)
                  .attr('data-infra-id', attrs.infraId);

                if (!attrs.autoSize) {
                  $root.style({
                    width: attrs.width + ((typeof attrs.width === "number") ? 'px' : ''),
                    height: attrs.height + ((typeof attrs.width === "number") ? 'px' : '')
                  });
                }

                var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
                config.datatype = attrs.datatype;
                config.autoSize = attrs.autoSize;
                config.nodeWidth = attrs.sliceWidth;
                config.sliceHeight = attrs.sliceHeight;
                //config.triggerActivity = true;
                config.visConfigId = attrs.visConfig || '';

                modifyConfig(config, infrastructure);

                new PVDHierarchyGrid($root, infrastructure, config, attrs.hierarchiesDown);
              });
            });
          }
        },
        scope: {
          'infraId': '@?', // id of infrastructure*.json
          'datatype': '@?', // mode like 'static', 'stream' (default: 'stream')
          'width': '@?', // svg width
          'height': '@?', // svg individual height
          'sliceWidth': '@?', // slice width
          'sliceHeight': '@?', // slice height
          'hierarchiesDown': '@?', //show multiple hierarchies at the same time
          'visConfig': '@?' // infrastructure.visConfig[...]
        },
        restrict: 'E'
      };
    }])
  .name; // name for export default
