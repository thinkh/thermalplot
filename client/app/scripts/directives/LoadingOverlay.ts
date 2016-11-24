/**
 * Created by Holger Stitz on 24.03.2015.
 * http://arqex.com/934/4-balls-10-spinners-css3-animations
 */
/// <reference path="../../../tsd.d.ts" />


module PVDVisualizations {

  angular.module('pipesVsDamsApp').directive('pvdLoadingOverlay', function (pvdInfrastructureLoader:PVDInfrastructureLoader, pvdDataSelection:PVDDataSelection) {
    return {
      templateUrl: 'views/templates/LoadingOverlay.html',
      link:  function ($scope:any, element) {
        pvdInfrastructureLoader.get($scope.infraId).then((infrastructure:PVDModels.Infrastructure) => {
          var id = '.loadingoverlay'+nextID();

          $scope.visible = true;

          pvdDataSelection.on('loadingOverlay'+id, (isVisible) => {
            $scope.$apply(() => {
              $scope.visible = isVisible;
            });
          });
        });
      },
      scope: {
        'infraId': '@?' // id of infrastructure*.json
      },
      restrict: 'EA'
    };
  });
}
