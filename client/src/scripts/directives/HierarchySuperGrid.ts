/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as angular from '@bower_components/angular';
import * as ng from '@bower_components/angular';
import * as d3 from '@bower_components/d3/d3';
import { PVDAHierarchyGrid } from './AHierarchyGrid';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { modifyConfig, onDelete } from './VisUtils';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import Animator, { PVDAnimator } from '../services/Animator';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import { Node, ExternalNode, Infrastructure } from '../models/Infrastructure';
import { PVDForceLayout } from './layouts/ForceLayout';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import ChangeBorderService, { PVDChangeBorder } from '../services/ChangeBorderService';

'use strict';

// render the nodes according to computed layout
export class PVDHierarchySuperGrid extends PVDAHierarchyGrid {

  constructor($root: d3.Selection, private infras: Infrastructure[], config: PVDHierarchyConfig, attrs: any) {
    super($root, config);
    this.attachListener();
    this.layouter = new PVDForceLayout(attrs.mappingLinks, attrs.d3Options);
    this.layouter.targetHierarchy = this.config.targetHierarchy;
    this.init(infras);
  }

  private init(infras: Infrastructure[]) {
    this.layouter.initNodes(null, infras[0].external);

    this.$root.selectAll(':not(.hg-edge-overlay)').remove();
    var that = this;
    this.createNode(infras[0].external);
    function traverse(n: Node) {
      that.createNode(n);
      n.children().forEach((c) => traverse(c));
    }
    infras.forEach((infra) => {
      modifyConfig(that.config, infra);
      traverse(infra.root);
    });

    this.relayout('infra');
  }

  hasChildrenCb(node: Node): boolean {
    var n = this.nodesMap.get(node.fqIname);
    if (n.collapsed) {
      return false;
    }
    if (n instanceof ExternalNode) {
      return true; //has the 3 roots as children
    }
    return n.hasNodeChildren();
  }

  parentCb(node: Node): Node {
    if (node === this.layouter.rootNode) {
      return null;
    }
    if (node.parent === null) {
      return this.layouter.rootNode;
    }
    return node.parent;
  }

  parentsCb(node: Node): Node[] {
    if (node === this.layouter.rootNode) {
      return [node];
    }
    if (node.parent === null) {
      return [node, this.layouter.rootNode];
    }
    return node.parents;
  }

  childrenCb(node: Node): Node[] {
    var n = this.nodesMap.get(node.fqIname);
    if (node === this.layouter.rootNode) {
      return this.infras.map((infr) => infr.root);
    }
    return n.nodeChildren();
  }

  private attachListener(): void {
    var id = '.super' + id;
    this.config.windowResize.on('change' + id, () => this.relayout('resize'));

    // transfer the hover to other hierarchies
    this.config.selection.on('hover' + id, (newNode: Node, oldNode: Node) => {
      if (newNode !== null && this.nodesMap.has(newNode.fqIname)) {
        this.nodesMap.get(newNode.fqIname).$node.classed('hg-hover', true);
      }

      if (oldNode !== null && this.nodesMap.has(oldNode.fqIname)) {
        this.nodesMap.get(oldNode.fqIname).$node.classed('hg-hover', false);
      }
    });

    this.config.selection.on('nodeWidth' + id, () => this.updateWidths());

    this.config.animator.push(this);
    onDelete(this.$root, () => {
      //debugger;
      this.config.animator.remove(this);
      this.config.windowResize.on('change' + id, null);
      this.config.selection.on('hover' + id, null);
      this.config.selection.on('nodeWidth' + id, null);
    });
  }
}

export default angular.module('directives.pvdHierarchySuperGrid', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorderService
])
  .directive('pvdHierarchySuperGrid', function (
    pvdInfrastructureLoader: PVDInfrastructureLoader,
    pvdWindowResize: PVDWindowResize,
    $timeout,
    pvdAnimator: PVDAnimator,
    pvdDataSelection: PVDDataSelection,
    pvdInfrastructureMapper: PVDInfrastructureMapper,
    pvdLayoutManager: PVDLayoutManager,
    $q: ng.IQService,
    pvdTargetHierarchy: PVDTargetHierarchy,
    pvdChangeBorder: PVDChangeBorder
  ) {
    return {
      compile: function (element, attrs: any) {
        attrs.autoSize = (!angular.isDefined(attrs.width) && !angular.isDefined(attrs.height));
        attrs.width = angular.isDefined(attrs.width) ? +attrs.width : '100%';
        attrs.height = angular.isDefined(attrs.height) ? +attrs.height : 500;
        attrs.sliceWidth = angular.isDefined(attrs.sliceWidth) ? +attrs.sliceWidth : 20;
        attrs.sliceHeight = angular.isDefined(attrs.sliceHeight) ? +attrs.sliceHeight : 20;
        attrs.mappingLinks = angular.isDefined(attrs.mappingLinks) ? eval('(' + attrs.mappingLinks + ')') : true;
        attrs.d3Options = angular.isDefined(attrs.d3Options) ? eval('(' + attrs.d3Options + ')') : {};

        return function ($scope, element) {
          $q.all(attrs.infraIds.split(',').map((infraId) => pvdInfrastructureLoader.get(infraId))).then((infrastructures: Infrastructure[]) => {
            $timeout(() => { //skip one time to ensure that the svg is properly layouted
              //var path:string = $scope.path;
              //var attr = infrastructure.findAttr(path);
              var $base = d3.select(element[0]);


              var $root: d3.Selection = $base.append('div')
                .classed('hg-grid', true)
                .classed('hg-mode-selection-target', true)
                .attr('data-infra-id', infrastructures[0].id)
                .classed('infra-' + infrastructures[0].id, true)
                .classed('color-' + infrastructures[0].color, true);

              if (!attrs.autoSize) {
                $root.style({
                  width: attrs.width + ((typeof attrs.width === "number") ? 'px' : ''),
                  height: attrs.height + ((typeof attrs.width === "number") ? 'px' : '')
                });
              }

              var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
              config.autoSize = attrs.autoSize;
              config.nodeWidth = attrs.sliceWidth;
              config.sliceHeight = attrs.sliceHeight;
              config.visConfigId = attrs.visConfig || '';

              modifyConfig(config, infrastructures[0]);

              new PVDHierarchySuperGrid($root, infrastructures, config, attrs);
            });
          });
        }
      },
      scope: {
        'infraIds': '@?', // id of infrastructure*.json
        'width': '@?', // svg width
        'height': '@?', // svg individual height
        'sliceWidth': '@?', // slice width
        'sliceHeight': '@?', // slice height
        'mappingLinks': '@?', // show mapping links in graph
        'd3Options': '&?', // JS object with {'size': [1, 1], 'linkStrength': 0.1, 'friction': 0.9, 'linkDistance': 20, 'charge': -30, 'gravity': 0.1}
        'visConfig': '@?' // infrastructure.visConfig[...].config
      },
      restrict: 'E'
    };
  })
  .name; // name for export default
