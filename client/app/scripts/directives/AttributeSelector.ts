/**
 * Created by Samuel Gratzl on 23.05.2014.
 */
/// <reference path="../../../tsd.d.ts" />

module PVDVisualizations {
  angular.module('pipesVsDamsApp').directive('pvdAttributeSelector', function ($compile:ng.ICompileService, pvdInfrastructureLoader:PVDInfrastructureLoader) {
    return  {
      templateUrl: 'views/templates/AttributeSelector.html',
      controller: function ($scope) {
        $scope.onPathChange = function () {
          if (!$scope.mpath) {
            $scope.mattrs = [];
            return;
          }
          //update the attribute list
          var bak = $scope.mattr;
          $scope.mattrs = $scope.mpath.attrs();
          if (bak) {
            $scope.mattrs.forEach((attr) => {
              if (attr.name === bak.name) {
                $scope.mattr = attr;
                $scope.onAttrChange();
              }
            });
          }
          return true;
        };
        $scope.onAttrChange = function() {
          if ($scope.mattr) {
            $scope.onAttrSelected({ attr: $scope.mattr});
          }
          return true;
        };
        //group by edge src and nodes
        $scope.groupOf = function(path) {
          if (path.hasOwnProperty("src")) {
            return path.src.fqIname+ " outgoing edges";
          }
          return "nodes";
        };
      },
      link: function ($scope, element:JQuery) {
        $scope.pathSelector = element.find(".path-selector");
        $scope.attrSelector = element.find(".attr-selector");
        //lazy get the infrastructure
        pvdInfrastructureLoader.get().then((infrastructure:PVDModels.Infrastructure) => {
          $scope.infrastructure = infrastructure;

          var n = infrastructure.nodes();
          var e = infrastructure.edges(n);
          n = n.filter(node => node.attrs().length > 0);
          //all nodes with attributes and edges
          $scope.mpaths = [].concat(n).concat(e);

          //init value
          var selection = infrastructure.find($scope.value);
          if (selection) {
            if ($scope.value.indexOf('#') > 0) {
              $scope.mpath = selection.parent;
              $scope.mattr = selection;
            } else {
              $scope.mpath = selection;
            }
            $scope.mattrs = $scope.mpath.attrs();
          }
        })
      },
      scope: {
        'onAttrSelected': '&',
        'value': '@',
        'withEdges' : '='
      },
      restrict: 'E'
    }
  })
}
