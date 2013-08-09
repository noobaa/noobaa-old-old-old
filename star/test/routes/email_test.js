/*jslint node: true */
'use strict';

var email = require('../../routes/email.js');


/*
  ======== A Handy Little Nodeunit Reference ========
  https://github.com/caolan/nodeunit

  Test methods:
    test.expect(numAssertions)
    test.done()
  Test assertions:
    test.ok(value, [message])
    test.equal(actual, expected, [message])
    test.notEqual(actual, expected, [message])
    test.deepEqual(actual, expected, [message])
    test.notDeepEqual(actual, expected, [message])
    test.strictEqual(actual, expected, [message])
    test.notStrictEqual(actual, expected, [message])
    test.throws(block, [error], [message])
    test.doesNotThrow(block, [error], [message])
    test.ifError(value)
*/


exports.test_emails = {
  // 'testing mandril': function(test) {
  //   test.ifError(email.test_mandril());
  //   test.done();
  // },
  'send welcome mail': function(test) {
    test.ifError(
      email.send_welcome({
          name: 'Yuval The Shark',
          email: 'yuval.dimnik@gmail.com'
        },
        function(err, res) {
          if (!err) {
            console.log(res);
          } else {
            console.log(JSON.stringify(err));
          }

        })
    );
    test.done();
  },
  // 'get templates': function(test) {
  //   test.ifError(email.get_templates(function(err, res) {}));
  //   test.done();
  // },
  // 'should send a welcome mail to Yuval': function(test) {
  //   test.ifError(email.send_welcome({
  //     name: 'Yuval The Shrk',
  //     email: 'yuval.dimnik@gmail.com'
  //   }, function(err, res, bod, more, done) {
  //     console.log(arguments);
  //   }));
  //   test.done();
  // },
};