'use strict';

describe('Directive: pvdHeb', function () {

  // load the directive's module
  beforeEach(module('pipesVsDamsApp'));

  var element,
    scope;

  beforeEach(inject(function ($rootScope) {
    scope = $rootScope.$new();
  }));

  it('should make hidden element visible', inject(function ($compile) {
    element = angular.element('<pvd-heb></pvd-heb>');
    element = $compile(element)(scope);
    expect(element.text()).toBe('this is the pvdHeb directive');
  }));
});
