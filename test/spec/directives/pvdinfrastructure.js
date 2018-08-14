'use strict';

describe('Directive: pvdInfrastructure', function () {

  // load the directive's module
  beforeEach(module('pipesVsDamsApp'));

  var element,
    scope;

  beforeEach(inject(function ($rootScope) {
    scope = $rootScope.$new();
  }));

  it('should make hidden element visible', inject(function ($compile) {
    element = angular.element('<pvd-infrastructure></pvd-infrastructure>');
    element = $compile(element)(scope);
    expect(element.text()).toBe('this is the pvdInfrastructure directive');
  }));
});
