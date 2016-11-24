/// <reference path="../../../tsd.d.ts" />


angular.module('pipesVsDamsApp').directive('pvdHierarchyNodeExplanation', function () {
    return {
      templateUrl: 'views/templates/HierarchyNodeExplanation.html',
      controller: function ($scope, $element, $attrs, $transclude, $timeout) {
        var $base = d3.select($element[0]);

        $base.select('.hg-label').call(PVDVisualizations.tooltip('Label'));
        $base.select('.heatmap').call(PVDVisualizations.tooltip('Heatmap with loadAvarage'));
        $base.select('.streamgraph.in').call(PVDVisualizations.tooltip('Stream graph incomming numConnections'));
        $base.select('.streamgraph.out').call(PVDVisualizations.tooltip('Stream graph outgoing numConnections'));

      },
      restrict: 'EA'
    }
  }
);
