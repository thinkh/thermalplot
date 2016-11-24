/// <reference path="../bower_components/jquery/jquery.js" />
/// <reference path="../bower_components/angular/angular.js" />
/// <reference path="../bower_components/d3/d3.js" />
/// <reference path="../bower_components/jquery/jquery.js" />
/// <reference path="../bower_components/angular/angular.js" />
/// <reference path="../bower_components/sass-bootstrap/dist/js/bootstrap.js" />
/// <reference path="../bower_components/angular-resource/angular-resource.js" />
/// <reference path="../bower_components/angular-cookies/angular-cookies.js" />
/// <reference path="../bower_components/angular-sanitize/angular-sanitize.js" />
/// <reference path="../bower_components/angular-route/angular-route.js" />
/// <reference path="../bower_components/d3/d3.js" />
/// <reference path="../bower_components/angular-bootstrap/ui-bootstrap-tpls.js" />

'use strict';

angular.module('pipesVsDamsApp', [
  'ngCookies',
  'ngResource',
  'ngSanitize',
  'ngRoute',
  'ui.bootstrap',
  'ui.bootstrap.datetimepicker'
])
  .config(['$routeProvider', function ($routeProvider) {
    $routeProvider
      .when("/uc/:usecase", {
        title: 'Use Case',
        templateUrl: "views/default_usecase.html",
        controller: "UseCaseRouteCtrl"
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
  }]);
