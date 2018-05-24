import * as angular from 'angular';
import * as angularCookies from 'angular-cookies';
import * as angularResource from 'angular-resource';
import * as angularSanitize from 'angular-sanitize';
import * as angularRoute from 'angular-route';
import * as angularBootstrap from 'angular-ui-bootstrap';
import * as angularBootstrapDateTimePicker from 'angularjs-bootstrap-datetimepicker';

// controller
import UseCaseSelectorController from './controllers/UseCaseSelectorController';
import UseCaseRouteController from './controllers/UseCaseRouteController';

'use strict';

export default angular.module('pipesVsDamsApp', [
  angularCookies,
  angularResource,
  angularSanitize,
  angularRoute,
  angularBootstrap,
  angularBootstrapDateTimePicker,
  UseCaseSelectorController,
  UseCaseRouteController
])
  .config(['$routeProvider', function ($routeProvider) {
    $routeProvider
      .when('/uc/:usecase', {
        title: 'Use Case',
        templateUrl: 'views/default_usecase.html',
        controller: 'UseCaseRouteCtrl'
      })
      /*.when('/heb', {
       title: 'Hierarchical Edge Bundling',
       templateUrl: 'scripts/playground/views/heb.html',
       controller: 'HebCtrl'
       })
       .when('/random', {
       title: 'Random',
       templateUrl: 'scripts/playground/views/random.html',
       controller: 'RandomCtrl'
       })
       .when('/chat', {
       title: 'Chat',
       templateUrl: 'scripts/playground/views/chat.html',
       controller: 'ChatCtrl'
       })*/
      .otherwise({
        templateUrl: 'views/usecase_selector.html',
        controller: 'UseCaseSelectorCtrl'
      });
  }])
  .run(['$rootScope', '$route', function ($rootScope, $route) {
    $rootScope.$on('$routeChangeSuccess', function (event, current) {
      $rootScope.title = " — " + $route.current.title;
    });
  }])
  .name; // name for export default
