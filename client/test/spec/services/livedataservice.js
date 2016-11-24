'use strict';

describe('Service: LiveDataService', function () {

  // load the service's module
  beforeEach(module('pipesVsDamsApp'));

  // instantiate service
  var LiveDataService;
  beforeEach(inject(function (_LiveDataService_) {
    LiveDataService = _LiveDataService_;
  }));

  it('should do something', function () {
    expect(!!LiveDataService).toBe(true);
  });

});
