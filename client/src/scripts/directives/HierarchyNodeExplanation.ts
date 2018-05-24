import * as angular from 'angular';
import * as d3 from 'd3';
import { tooltip } from './VisUtils';

export default angular.module('directives.pvdHierarchyNodeExplanation')
  .directive('pvdHierarchyNodeExplanation', [function () {
    return {
      templateUrl: 'views/templates/HierarchyNodeExplanation.html',
      controller: function ($scope, $element, $attrs, $transclude, $timeout) {
        var $base = d3.select($element[0]);

        $base.select('.hg-label').call(tooltip('Label'));
        $base.select('.heatmap').call(tooltip('Heatmap with loadAvarage'));
        $base.select('.streamgraph.in').call(tooltip('Stream graph incomming numConnections'));
        $base.select('.streamgraph.out').call(tooltip('Stream graph outgoing numConnections'));

      },
      restrict: 'EA'
    }
  }])
  .name; // name for export default
