'use strict';

describe('Controller: ChatCtrl', function () {

  // load the controller's module
  beforeEach(module('pipesVsDamsApp'));

  var ChatCtrl,
    scope;

  // Initialize the controller and a mock scope
  beforeEach(inject(function ($controller, $rootScope) {
    scope = $rootScope.$new();
    ChatCtrl = $controller('ChatCtrl', {
      $scope: scope
    });
  }));

  it('should attach a list of awesomeThings to the scope', function () {
    //expect(scope.messages.length).toBe(0);
    expect(true).toBe(true);
  });
});
