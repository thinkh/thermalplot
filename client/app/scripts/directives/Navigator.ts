/**
 * Created by Samuel Gratzl on 02.05.2014.
 */

/// <reference path="../../../tsd.d.ts" />

/**
 * create a simple time selector, which will send back to the service to jump in time
 */
angular.module('pipesVsDamsApp').directive('pvdNavigator', function () {
    return {
      templateUrl: 'views/templates/Navigator.html',
      controller: function ($scope, $element, $timeout, $filter,
                            pvdAnimator:PVDAnimator, pvdDataService:PVDDataService,
                            pvdBookmarkService:PVDBookmarkService) {

        $scope.preJumpTo = () => {
          var t = pvdAnimator.now;
          $scope.date = new Date();
          $scope.date.setTime(t); //set in utc time
        };

        $scope.jumpTo = (date:Date) => {
          console.info("jump to " + date.toUTCString());
          pvdDataService.jumpTo(date);
        };

        var bookmarkId = ".navigator"+PVDVisualizations.nextID();
        pvdBookmarkService.on('set'+bookmarkId, (bookmarks:any) => {
            $scope.bookmarks = bookmarks;
          }
        );
        PVDVisualizations.onDelete(d3.select($element[0]),() => {
          pvdBookmarkService.on('set'+bookmarkId, null);
        });

        // initial load
        $scope.bookmarks = pvdBookmarkService.get();
      },
      restrict: 'EA'
    }
  }
);
