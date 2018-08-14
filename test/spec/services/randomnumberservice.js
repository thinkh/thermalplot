'use strict';

describe('Service: RandomNumberService', function () {

  // load the service's module
  beforeEach(module('pipesVsDamsApp'));

  // instantiate service
  var RandomNumberService;
  beforeEach(inject(function (_RandomNumberService_) {
    RandomNumberService = _RandomNumberService_;
  }));

  it('should do something', function () {
    expect(!!RandomNumberService).toBe(true);
  });

});
