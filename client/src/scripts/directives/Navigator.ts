/**
 * Created by Samuel Gratzl on 02.05.2014.
 */

import * as angular from 'angular';
import * as d3 from 'd3';
import { onDelete, nextID } from './VisUtils';
import { PVDAnimator } from '../services/Animator';
import { PVDDataService } from '../services/DataService';
import { PVDBookmarkService } from '../services/BookmarkService';

/**
 * create a simple time selector, which will send back to the service to jump in time
 */
export default angular.module('directives.pvdNavigator', [])
  .directive('pvdNavigator', [function () {
    return {
      templateUrl: 'views/templates/Navigator.html',
      controller: function (
        $scope,
        $element,
        $timeout,
        $filter,
        pvdAnimator: PVDAnimator,
        pvdDataService: PVDDataService,
        pvdBookmarkService: PVDBookmarkService
      ) {

        $scope.preJumpTo = () => {
          var t = pvdAnimator.now;
          $scope.date = new Date();
          $scope.date.setTime(t); //set in utc time
        };

        $scope.jumpTo = (date: Date) => {
          console.info("jump to " + date.toUTCString());
          pvdDataService.jumpTo(date);
        };

        var bookmarkId = ".navigator" + nextID();
        pvdBookmarkService.on('set' + bookmarkId, (bookmarks: any) => {
          $scope.bookmarks = bookmarks;
        }
        );
        onDelete(d3.select($element[0]), () => {
          pvdBookmarkService.on('set' + bookmarkId, null);
        });

        // initial load
        $scope.bookmarks = pvdBookmarkService.get();
      },
      restrict: 'EA'
    }
  }])
  .name; // name for export default
