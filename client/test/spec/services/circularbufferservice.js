'use strict';

describe('Service: CircularBufferService', function () {

  // load the service's module
  beforeEach(module('pipesVsDamsApp'));

  // instantiate service
  var circularBufferService;
  beforeEach(inject(function (_circularBufferService_) {
    circularBufferService = _circularBufferService_;
  }));

  it('should do something', function () {
    expect(!!circularBufferService).toBe(true);
  });

});
