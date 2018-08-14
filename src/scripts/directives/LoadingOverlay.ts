/**
 * Created by Holger Stitz on 24.03.2015.
 * http://arqex.com/934/4-balls-10-spinners-css3-animations
 */
import * as angular from 'angular';
import { Infrastructure } from '../models/Infrastructure';
import DataSelection, { PVDDataSelection } from '../services/DataSelection';
import InfrastructureLoader, { PVDInfrastructureLoader } from '../services/InfrastructureLoader';
import { nextID } from './VisUtils';

export default angular.module('directives.pvdLoadingOverlay', [
  InfrastructureLoader,
  DataSelection
])
  .directive('pvdLoadingOverlay', [
    'pvdInfrastructureLoader',
    'pvdDataSelection',
    function (
    pvdInfrastructureLoader: PVDInfrastructureLoader,
    pvdDataSelection: PVDDataSelection
  ) {
    return {
      templateUrl: 'views/templates/LoadingOverlay.html',
      link: function ($scope: any, element) {
        pvdInfrastructureLoader.get($scope.infraId).then((infrastructure: Infrastructure) => {
          var id = '.loadingoverlay' + nextID();

          $scope.visible = true;

          pvdDataSelection.on('loadingOverlay' + id, (isVisible) => {
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
  }])
  .name; // name for export default
