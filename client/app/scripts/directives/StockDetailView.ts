/**
 * Created by Holger Stitz on 09.03.2015.
 */
/// <reference path='../../../tsd.d.ts' />
/*global d3*/
'use strict';


module PVDVisualizations {

  class StockDetailView {

    private nodesMap:D3.Map<PVDHierarchyNode> = d3.map();

    private $info;

    constructor(private $root, private config, private isStandalone) {
      this.attachListener();
      this.rescale();

      this.$info = this.$root.append('p')
        .classed('info', true)
        .text('Select one or more items to see details here.')
    }

    private attachListener() {
      var that = this;

      var id = '.stockdetail'+nextID();

      this.config.windowResize.on('change'+id, () => {
        that.rescale();
        tooltip().hide();
      });

      this.config.changeBorder.on('maxsize'+id, () => {
        that.rescale();
      });

      this.config.selection.on('selectall'+id, (newNode, allNodes, oldNodes) => {
        tooltip().hide();
        that.drawSymbols(allNodes);
      });

      //this.config.animator.push(this);
      onDelete(this.$root, () => {
        //this.config.animator.remove(this);
        this.config.windowResize.on('change' + id, null);
        this.config.changeBorder.on('maxsize'+id, null);
        this.config.selection.on('selectall'+id, null);
      });
    }

    private drawSymbols(allNodes) {
      var that = this;

      var blocks = that.$root.selectAll('div.hg-node')
        .data(allNodes, (d) => d.fqIname);

      blocks.enter().append('div')
        .each(function(node) {
          modifyConfig(that.config, node.infrastructure);
          var nodeEl = new PVDHierarchyNode(node, that.$root, that.config, null);
          nodeEl.addTimelineHighlight();
          nodeEl.children(that.config.showInNode(nodeEl.hasNodeChildren(), node));
          nodeEl.setDefaultScaleFactor(that.config);
          nodeEl.relayout(that.config.gridWidth, nodeEl.scaleFactor[1] * that.config.sliceHeight);
          nodeEl.show();
          nodeEl.$node.style('position', 'relative');

          that.nodesMap.set(node.fqIname, nodeEl);

          // copy d3 data and remove the empty div from enter()
          nodeEl.$node.datum(d3.select(this).datum());
          d3.select(this).remove();
        });

      blocks.exit().remove();

      that.$info.classed('hg-hidden', blocks.size() > 0);

      that.rescaleNodes();
    }

    private rescaleNodes() {
      var that = this,
        width = that.config.gridWidth;

      if(that.$root.node().scrollHeight > that.config.gridHeight ) {
        width = that.config.gridWidth - 20;
      }

      that.nodesMap.forEach((fqIname, nodeEl) => {
        nodeEl.relayout(width, nodeEl.scaleFactor[1] * that.config.sliceHeight);
      });
    }

    /**
     * Calculates a space-filling grid rectangle and
     * sets the range for the x-axis and y-axis
     */
    private rescale() {
      var that = this;
      var elemRect = this.$root.node().parentNode.getBoundingClientRect();

      that.config.gridWidth = elemRect.width;
      that.config.gridHeight = (that.config.changeBorder.horizontal !== undefined) ? that.config.changeBorder.horizontal.maxSize : (window.innerHeight - elemRect.top - 20); // 20px = body padding-bottom

      that.rescaleNodes();

      // only resize in conjunction with the ThermalLayout
      if(that.isStandalone === false) {
        that.$root.style({
          width: that.config.gridWidth + 'px',
          height: that.config.gridHeight + 'px'
        });
      }
    }
  }

  angular.module('pipesVsDamsApp').directive('pvdStockDetailView', function (pvdInfrastructureLoader:PVDInfrastructureLoader, pvdWindowResize:PVDWindowResize, $timeout, pvdAnimator: PVDAnimator, pvdDataSelection: PVDDataSelection, pvdInfrastructureMapper: PVDInfrastructureMapper, pvdLayoutManager:PVDLayoutManager, pvdTargetHierarchy:PVDTargetHierarchy, pvdChangeBorder:PVDChangeBorder) {
    return  {
      controller: function ($scope) {

      },
      compile: function (element, attrs:any) {
        attrs.isStandalone = (angular.isDefined(attrs.isStandalone) && attrs.isStandalone === 'true') ? true : false;

        return function ($scope, element) {
          $timeout(() => { //skip one time to ensure that the svg is properly layouted
            var $base = d3.select(element[0]);

            var $root:D3.Selection = $base.append('div')
              .classed('pvd-stock-detail', true);

            var config = new PVDHierarchyConfig(pvdAnimator, pvdDataSelection, pvdLayoutManager, pvdInfrastructureMapper, pvdTargetHierarchy, pvdChangeBorder, pvdWindowResize);
            config.visConfigId = attrs.visConfig || 'detailView';

            new StockDetailView($root, config, attrs.isStandalone);
          });
        }
      },
      scope: {
        'visConfig': '@?', // modifier for infrastructure.visConfig[...]
        'isStandalone': '@?' // is this directive used without the ThermalLayout directive? (default: false)
      },
      restrict: 'EA'
    }
  });

}
