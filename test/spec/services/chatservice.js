'use strict';

describe('Service: ChatService', function () {

  // load the service's module
  beforeEach(module('pipesVsDamsApp'));

  // instantiate service
  var ChatService;
  beforeEach(inject(function (_ChatService_) {
    ChatService = _ChatService_;
  }));

  it('should do something', function () {
    expect(!!ChatService).toBe(true);
  });

});
