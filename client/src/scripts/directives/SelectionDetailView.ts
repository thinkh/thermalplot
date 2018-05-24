/**
 * Created by Holger Stitz on 23.10.2014.
 */

import * as angular from 'angular';
import * as d3 from 'd3';
import { PVDHierarchyConfig } from './HierarchyConfig';
import { PVDHierarchyAInlay, PVDHierarchyDownInlayStacked, PVDHierarchyUpInlayStacked, PVDHierarchyDownInlay, PVDHierarchyUpInlay } from './HierarchyInlay';
import { PVDHierarchyOracle, PVDElementParent, PVDHierarchyNode } from './HierarchyNode';
import { modifyConfig, onDelete, nextID } from './VisUtils';
import { Node, Infrastructure } from '../models/Infrastructure';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import Animator, { PVDAnimator } from '../services/Animator';
import InfrastructureMapper, { PVDInfrastructureMapper } from '../services/InfrastructureMapper';
import TargetHierarchy, { PVDTargetHierarchy } from '../services/TargetHierarchy';
import WindowResize, { PVDWindowResize } from '../services/WindowResize';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import LayoutManager, { PVDLayoutManager } from '../services/LayoutManager';
import ChangeBorder, { PVDChangeBorder } from '../services/ChangeBorderService';

'use strict';


class SelectionDetailView implements PVDElementParent {

  private inlayUp: PVDHierarchyUpInlay = null;
  private inlayDown: PVDHierarchyDownInlay = null;

  hierarchy: PVDHierarchyOracle;

  private lateInit = false;

  constructor(public $root: d3.Selection<any>, public config: PVDHierarchyConfig, public targetHierarchy: PVDTargetHierarchy) {
    this.attachListener();

    this.config.gridWidth = (<Element>this.$root[0][0]).getBoundingClientRect()['width'];
  }

  private attachListener(): void {
    var that = this;
    var id = '.matchingviewer' + nextID();

    // select node and show inlay if necessary
    function getNodePos(node: Node) {
      return { x: 0, y: 0 };
    }

    this.config.selection.on('selectall' + id + '-2', (newNode: Node, all: Node[], prev: Node[]) => {
      if (!this.lateInit) {
        this.init(this.config.selection.infra);
        this.lateInit = true;
      }
      if (this.inlayUp !== null) {
        this.inlayUp.updateSelection(all, getNodePos);
      }
      if (this.inlayDown !== null) {
        this.inlayDown.updateSelection(all, getNodePos);
      }
      this.relayout();
    }
    );

    this.config.selection.on('infra' + id, (newInfra: Infrastructure) => {
      if (!this.lateInit) {
        this.init(newInfra);
        this.lateInit = true;
      }
      this.relayout();
    });

    this.config.windowResize.on('change' + id, () => {
      this.config.gridWidth = (<Element>this.$root[0][0]).getBoundingClientRect()['width'];
      this.relayout();
    });

    onDelete(this.$root, () => {
      this.config.selection.on('selectall' + id + '-2', null);
      this.config.selection.on('infra' + id, null);
      this.config.windowResize.on('change' + id, null);
    });
  }

  private init(infra: Infrastructure) {
    var target = this.targetHierarchy.targetFromInfra(true, infra);
    if (target.length > 0) {
      this.inlayUp = this.createInlayUp();
    } else {
      this.inlayUp = null;
    }
    target = this.targetHierarchy.targetFromInfra(false, infra);
    if (target.length > 0) {
      this.inlayDown = this.createInlayDown();
    } else {
      this.inlayDown = null;
    }
  }

  createInlayUp() {
    var config = this.config.clone();
    return new PVDHierarchyUpInlayStacked(this.$root, config, this);
  }

  createInlayDown() {
    var config = this.config.clone();
    return new PVDHierarchyDownInlayStacked(this.$root, config, this)
  }

  relayout() {
    var that = this;

    [this.inlayUp, this.inlayDown].forEach((inlay: PVDHierarchyAInlay) => {
      if (inlay == null) {
        return;
      }

      inlay.pos(0, 0);
      inlay.relayout(that.config.gridWidth, 1);
      inlay.show();
    });
  }

  dirtyLayout() {

  }

  focusOn(newroot: Node) {

  }

  collapsedChanged(node: PVDHierarchyNode) {

  }

  anchorPoint(position?: number[]) {

  }
}

export default angular.module('directives.pvdSelectionDetailView', [
  InfrastructureLoader,
  WindowResize,
  Animator,
  DataSelection,
  InfrastructureMapper,
  LayoutManager,
  TargetHierarchy,
  ChangeBorder
])
  .directive('pvdSelectionDetailView', [
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
        return function ($scope, element) {
          $timeout(() => { //skip one time to ensure that the svg is properly layouted
            var $base = d3.select(element[0]);

            var $root: d3.Selection<any> = $base.append('div')
              .classed('hg-matchingviewer', true);

            var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
            config.visConfigId = attrs.visConfig || 'detailView';

            if (pvdDataSelection.infra !== null) {
              modifyConfig(config, pvdDataSelection.infra);
            }

            new SelectionDetailView($root, config, pvdTargetHierarchy);
          });
        }
      },
      scope: {
        'visConfig': '@?' // modifier for infrastructure.visConfig[...]
      },
      restrict: 'EA'
    }
  }])
  .name; // name for export default

