/**
 * Created by Samuel Gratzl on 24.04.2014.
 */

/// <reference path="../../../tsd.d.ts" />

/**
 * directive showing the current selection and buttons to pin, reset the selection
 */
angular.module('pipesVsDamsApp').directive('pvdSelectionInfo', function () {
    return {
      templateUrl: 'views/templates/SelectionInfo.html',
      controller: function ($scope, $element, $attrs, $transclude, $timeout, pvdAnimator: PVDAnimator, pvdDataSelection:PVDDataSelection) {
        $scope.reset = function () {
          pvdDataSelection.resetSelection();
          $scope.hasSelection = false;
        };
        $scope.togglePinning = function () {
          var now = pvdAnimator.now;
          var s = pvdDataSelection.getSelection(now);
          if (pvdDataSelection.isPinned) { //convert to relative
            pvdDataSelection.setRelativeSelection(s.point - now, s.past, s.future);
          } else { //convert to absolute
            pvdDataSelection.setPinnedSelection(s.point, s.past, s.future);
          }
        };
        var dateformat = d3.time.format.utc("%j days %H hours %M minutes %S secs");
        var toSec = (n : number) => {
          var d = new Date();
          d.setTime(n);
          return dateformat(d);
          /*var s = Math.round(Math.abs(n) / 1000);
          var r = '';
          if (s > 60) {

          }
          +" sec";*/
        }

        var id = '.info'+PVDVisualizations.nextID();
        pvdDataSelection.on("change"+id, function(act: PVDSelection) {
          $scope.hasSelection = act.hasDefinedStart || act.point !== 0;
          if (act.hasDefinedStart || act.point !== 0) {
            var s = "";
            if (pvdDataSelection.isPinned) {
              var d = new Date();
              d.setTime(act.point);
              s = dateformat(d);
              s = s + (act.hasDefinedStart ? " and " + toSec(act.past) + " back" : "");
            } else {
              //it is a relative selection, point = relative to now
              if (act.point === 0) { //no shift at all
                s = toSec(act.past) + " back";
              } else {
                s = "past " + toSec(act.point);
                s = s + (act.hasDefinedStart ? " and " + toSec(act.past) + " back" : "");
              }
            }
            if (act.steps > 1) {
              s = s += ' with ' + act.steps + ' bins';
            }
            $scope.selection = s;
          }
          $scope.pinned = pvdDataSelection.isPinned ? "unpin" : "pin";
          $timeout(() => $scope.$apply());
        });
        pvdDataSelection.on("selectall"+id, function(new_ : PVDModels.Node, all: PVDModels.Node[]) {
          $scope.selected = all.map((s) => s.fqIname);
          $timeout(() => $scope.$apply());
        });
        pvdDataSelection.on("infra"+id, function(new_ : PVDModels.Infrastructure) {
          $scope.sinfra = new_ ? new_.name : '';
          $timeout(() => $scope.$apply());
        });
        $scope.hasSelection = false;
        $scope.sinfra = '';
        $scope.pinned = pvdDataSelection.isPinned ? "unpin" : "pin";


        PVDVisualizations.onDelete(d3.select($element[0]),() => {
          pvdDataSelection.on('infra'+id, null);
          pvdDataSelection.on('selectall'+id, null);
          pvdDataSelection.on('change'+id, null);
        });
      },
      restrict: 'EA'
    }
  }
);