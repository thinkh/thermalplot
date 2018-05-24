/**
 * Created by Holger Stitz on 18.08.2014.
 */
import * as angular from 'angular';
import * as d3 from 'd3';
import { PVDAHierarchyGrid } from './AHierarchyGrid';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { modifyConfig, nextID, onDelete } from './VisUtils';
import { Node, Infrastructure } from '../models/Infrastructure';
import { PVDHierarchyNode } from './HierarchyNode';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import Animator, { PVDAnimator } from '../services/Animator';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import { PVDLayoutBundle } from './layouts/Layout';
import { PVDGridLayout } from './layouts/GridLayout';
import { PVDVerticalGridLayout } from './layouts/VerticalGridLayout';
import ChangeBorderService, { SegmentRepresentation, PVDChangeBorder } from '../services/ChangeBorderService';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager } from '../services/LayoutManager';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';

'use strict';


// render the nodes according to computed layout
export class PVDHierarchySmallMultiple extends PVDAHierarchyGrid {
  private _positions;

  constructor($root, private infra: Infrastructure, config: PVDHierarchyConfig) {
    super($root, config, false);
    this.config.mode = 'selection-source';
    this.attachListener();
    this.init(infra);
  }

  private init(infra: Infrastructure): void {
    this.infra = infra;

    if (this.$root === null) {
      return;
    }

    // delete everything
    this.$root.selectAll(':not(.hg-edge-overlay)').remove();
    this.$root
      .attr('data-infra-id', infra.id)
      .classed('infra-' + infra.id, true)
      .classed('color-' + infra.color, true);

    modifyConfig(this.config, infra);

    if (this.config.orientation === 'horizontal') {
      this.layouter = new PVDGridLayout();
    } else {
      this.layouter = new PVDVerticalGridLayout();
      this.config.autoSize = false;
    }
    this.layouter.initNodes(null, infra.root);

    this.createNode(this.infra.external);
    var that = this;
    function traverse(n: Node) {
      that.createNode(n);
      n.children().forEach((c) => traverse(c));
    }
    traverse(this.infra.root);

    this.relayout('infra');
  }

  private attachListener(): void {
    var that = this;

    var id = '.small' + nextID();

    // initialize layout for a new node again
    this.infra.on('addNode' + id, (newNode) => {
      this.layouter.initNodes(null, this.infra.root);
      this.createNode(newNode);
      this.relayout('update');
    });

    this.config.windowResize.on('change' + id, () => this.relayout('resize'));

    this.config.changeBorder.on('crossed' + id, (node: Node, newSegmentRep: SegmentRepresentation) => {
      if (this.nodesMap.has(node.fqIname) === false || newSegmentRep === undefined) { return; }

      if (newSegmentRep.isHidden('SmallMultiple')) {
        this.nodesMap.get(node.fqIname).hide();
      } else {
        this.nodesMap.get(node.fqIname).show();
      }
    });

    this.config.changeBorder.on('req_layout_coord' + id, (infra, isFirstCall) => {
      that.replyLayoutCoords(infra, isFirstCall);
    });

    // transfer the hover to other hierarchies
    this.config.selection.on('hover' + id, (newNode: Node, oldNode: Node) => {
      if (newNode !== null && this.nodesMap.has(newNode.fqIname)) {
        this.nodesMap.get(newNode.fqIname).$node.classed('hg-hover', true);
      }
      if (oldNode !== null && this.nodesMap.has(oldNode.fqIname)) {
        this.nodesMap.get(oldNode.fqIname).$node.classed('hg-hover', false);
      }
    });

    function highlightRelatedNodes() {
      // highlight only in selection-source
      var nodes = that.config.selection.getSelectionsAsUnchecked(that.infra.id);

      that.infra.nodes().forEach((n) => {
        if (that.nodesMap.has(n.fqIname)) {
          that.nodesMap.get(n.fqIname).highlighted = false;

          // semi-transparent nodes only for small multiples
          if (that.config.mode === 'selection-source') {
            that.nodesMap.get(n.fqIname).semiTransparent = (nodes.length > 0);
          }
        }
      });

      // no selection
      if (nodes === null) {
        that.relayout('highlight-false'); // apply the highlight = false
        return;
      }

      nodes.forEach((n) => {
        if (that.nodesMap.has(n.fqIname)) {
          that.nodesMap.get(n.fqIname).highlighted = true;
          that.nodesMap.get(n.fqIname).semiTransparent = false;

          // remove semi-transparency for parents
          that.parentsCb(n).forEach((pn) => {
            if (that.nodesMap.has(pn.fqIname)) {
              that.nodesMap.get(pn.fqIname).semiTransparent = false;
            }
          });
        }
      });

      that.relayout('highlight-true');
    }

    // highlight related nodes in other hierarchies
    this.config.selection.on('selectall' + id, () => {
      highlightRelatedNodes();
    });

    // on changing the infrastructure / perspective make blocks visible
    this.config.selection.on('infra' + id,
      (newInfra: Infrastructure, oldInfra: Infrastructure) => {
        if (oldInfra !== null) {
          oldInfra.nodes().forEach((n) => {
            if (n !== oldInfra.external && that.nodesMap.has(n.fqIname)) {
              that.nodesMap.get(n.fqIname).show();
            }
          });
        }
      }
    );

    // init selection source and target
    this.$root.on('click', () => {
      this.config.selection.infra = this.infra;
      this.config.selection.clearSelection();
    });

    this.config.selection.on('dragEnd' + id, () => {
      highlightRelatedNodes();
    });

    this.config.animator.push(this);
    onDelete(this.$root, () => {
      this.config.animator.remove(this);
      this.config.windowResize.on('change' + id, null);
      this.config.changeBorder.on('crossed' + id, null);
      this.config.changeBorder.on('req_layout_coord' + id, null);
      this.config.selection.on('hover' + id, null);
      this.config.selection.on('selectall' + id, null);
      this.config.selection.on('dragEnd' + id, null);
      this.config.selection.on('infra' + id, null);
    })
  }

  private replyLayoutCoords(infra, isFirstCall) {
    if (infra !== this.infra) { return; }

    var offset = { top: 0, left: 0, width: 0, height: 0 };
    offset.top = (<HTMLElement>this.$root[0][0]).offsetTop;
    offset.left = 0; //(<HTMLElement>this.$root[0][0]).offsetLeft;
    offset.width = (<HTMLElement>this.$root[0][0]).offsetWidth;
    offset.height = (<HTMLElement>this.$root[0][0]).offsetHeight;

    this.config.changeBorder.replyLayoutCoordinates(infra, isFirstCall, this._positions, offset);
  }

  collapsedChanged(node: PVDHierarchyNode) {

  }

  relayout(event: string): void;
  relayout(width: number, height: number): void;
  relayout(): void {
    if (this.config.orientation === 'horizontal') {
      super.relayout.call(this, arguments);

    } else {
      var $overview = d3.select((<HTMLElement>this.$root[0][0]).parentNode.parentNode),
        gridWidth = this.gridWidth,
        gridHeight = ((<any>$overview[0][0]).parentNode.getBoundingClientRect().height / (<HTMLElement>$overview[0][0]).children.length),
        bundle: PVDLayoutBundle;

      if (this.config.autoShrink) {
        this.nodesMap.forEach((fqname, node) => node.autoShrink());
      }

      bundle = this.layouter.apply(gridWidth, gridHeight, 1, this.config.sliceHeight);
      var outerDim = this.updateNodePosition(bundle.positions);

      this._positions = bundle.positions;
      this.replyLayoutCoords(this.infra, false);

      this.$root.style({
        width: outerDim[0] + 'px',
        height: gridHeight + 'px'
      });
    }
  }
}

export default angular.module('directives.pvdHierarchySmallMultiple', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorderService
])
  .directive('pvdHierarchySmallMultiple', [
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
      compile: function (element, attrs: any) {
        attrs.autoSize = (!angular.isDefined(attrs.width) && !angular.isDefined(attrs.height));
        attrs.width = angular.isDefined(attrs.width) ? +attrs.width : '100%';
        attrs.height = angular.isDefined(attrs.height) ? +attrs.height : 500;
        attrs.sliceWidth = angular.isDefined(attrs.sliceWidth) ? +attrs.sliceWidth : 20;
        attrs.sliceHeight = angular.isDefined(attrs.sliceHeight) ? +attrs.sliceHeight : 20;
        attrs.orientation = angular.isDefined(attrs.orientation) ? attrs.orientation : 'horizontal';
        attrs.showInfraTitle = angular.isDefined(attrs.showInfraTitle) ? attrs.showInfraTitle : false;

        return function ($scope, element) {
          pvdInfrastructureLoader.get(attrs.infraId).then((infrastructure: Infrastructure) => {
            $timeout(() => { //skip one time to ensure that the svg is properly layouted
              //var path:string = $scope.path;
              //var attr = infrastructure.findAttr(path);
              var $base = d3.select(element[0]);

              if (attrs.showInfraTitle) {
                $base.append('p')
                  .attr('class', 'hg-smult-title')
                  .text(infrastructure.name);
              }

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
              config.orientation = attrs.orientation;
              config.datatype = attrs.datatype;
              config.autoSize = attrs.autoSize;
              config.nodeWidth = attrs.fullNodeWidth;
              config.sliceHeight = attrs.sliceHeight;
              config.visConfigId = attrs.visConfig || '';

              modifyConfig(config, infrastructure);

              new PVDHierarchySmallMultiple($root, infrastructure, config);
            }, 10);
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
        'orientation': '@?', // vertical || horizontal (default)
        'visConfig': '@?', // modifier for infrastructure.visConfig[...]
        'showInfraTitle': '@?' // show infrastructure title (default: false)
      },
      restrict: 'E'
    };
  }])
  .name; // name for export default
