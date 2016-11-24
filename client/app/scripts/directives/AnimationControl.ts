/**
 * Created by Samuel Gratzl on 18.04.2014.
 */
/// <reference path="../../../tsd.d.ts" />

/**
 * a simple animation control directive for pausing / resuming the animator and showing the current time
 */
angular.module('pipesVsDamsApp')
  .directive('pvdAnimationControl', function ($timeout, pvdAnimator: PVDAnimator) {
    var dateformat = d3.time.format.utc("%Y-%m-%dT%H:%M:%S");
    return {
      template: '<div class="btn-group">' +
        '<button class="btn btn-default" ng-click="(isAnimating == true) ? stop() : start()" title="{{(isAnimating == true) ? \'Visualization is playing, click to pause\' : \'Visualization is paused, click to play\'}}">' +
        '<i ng-class="{true: \'fa fa-pause\', false: \'fa fa-play\'}[isAnimating]"></i><span class="sr-only">&nbsp;{{(isAnimating == true) ? \'Playing\' : \'Paused\'}}</span>' +
        '</button></div>',
      restrict: 'E',
      link: function postLink($scope, element) {
        (<any>$scope).isAnimating = pvdAnimator.isAnimating;
        var $b = $(element).find('button');
        var id = '.control'+PVDVisualizations.nextID();
        pvdAnimator.on("start"+id, function() {
          (<any>$scope).isAnimating = true;
          $timeout(() => $scope.$apply());
        });
        pvdAnimator.on("stop"+id, function() {
          (<any>$scope).isAnimating = false;
          $timeout(() => $scope.$apply());
        });
        /*pvdAnimator.on("tick"+id, function(dt: number, now: number) {
          //use jquery to avoid the angular chain
          $b.text(dateformat(new Date(now)));
          //$scope.now = ;
          //$timeout(() => $scope.$apply());
        });*/
        PVDVisualizations.onDelete(d3.select(element[0]),() => {
          pvdAnimator.on('start'+id, null);
          pvdAnimator.on('stop'+id, null);
          pvdAnimator.on('tick'+id, null);
        });

        (<any>$scope).start = function() {
          pvdAnimator.start();
        };

        (<any>$scope).stop = function() {
          pvdAnimator.stop();
        };
      }
    };
  });
