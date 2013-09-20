/*jslint node: true */

'use strict';

process.on('uncaughtException', function(err) {
    console.log('Caught exception: ' + err + err.stack);
});

var async = require('async');
var email = require('./email.js');
var db_connect = require('../db_connect');

var test_common = require('../test_common');

var User = require('../models/user').User;

// var profile = {
//     provider: 'facebook',
//     id: '100000601353304',
//     username: 'yuval.dimnik',
//     displayName: 'Yuval Dimnik',
//     name: {
//         familyName: 'Dimnik',
//         givenName: 'Yuval',
//         middleName: undefined
//     },
//     gender: 'male',
//     profileUrl: 'https://www.facebook.com/yuval.dimnik',
//     emails: [
//         [Object]
//     ],
//     _raw: '{"id":"100000601353304","name":"Yuval Dimnik","first_name":"Yuval","last_name":"Dimnik","link":"https:\\/\\/www.facebook.com\\/yuval.dimnik","username":"yuval.dimnik","hometown":{"id":"103113623062213","name":"Bat Yam"},"location":{"id":"114749948541219","name":"Ramot Me\'ir"},"quotes":"\\"Smile, you don\'t have much left\\" - Me","work":[{"employer":{"id":"7706457055","name":"Dell"},"start_date":"2010-02-01","end_date":"2013-05-01"},{"employer":{"id":"109337459095423","name":"Exanet"},"start_date":"2005-07-01","end_date":"2010-02-01"}],"sports":[{"id":"111932052156866","name":"Surfing","with":[{"id":"679921464","name":"Tomer Mizrahi"},{"id":"596358122","name":"Kfir Dahan"}]}],"education":[{"school":{"id":"105960532777745","name":"Shazar High School"},"year":{"id":"137409666290034","name":"1995"},"type":"High School"},{"school":{"id":"176662212386543","name":"Tel Aviv University | \\u05d0\\u05d5\\u05e0\\u05d9\\u05d1\\u05e8\\u05e1\\u05d9\\u05d8\\u05ea \\u05ea\\u05dc-\\u05d0\\u05d1\\u05d9\\u05d1"},"type":"College"},{"school":{"id":"176662212386543","name":"Tel Aviv University | \\u05d0\\u05d5\\u05e0\\u05d9\\u05d1\\u05e8\\u05e1\\u05d9\\u05d8\\u05ea \\u05ea\\u05dc-\\u05d0\\u05d1\\u05d9\\u05d1"},"degree":{"id":"196378900380313","name":"MBA"},"year":{"id":"140617569303679","name":"2007"},"type":"Graduate School"}],"gender":"male","email":"yuval.dimnik\\u0040gmail.com","timezone":3,"locale":"en_US","verified":true,"updated_time":"2013-08-06T09:32:25+0000"}',
//     _json: {
//         id: '100000601353304',
//         name: 'Yuval Dimnik',
//         first_name: 'Yuval',
//         last_name: 'Dimnik',
//         link: 'https://www.facebook.com/yuval.dimnik',
//         username: 'yuval.dimnik',
//         hometown: [Object],
//         location: [Object],
//         quotes: '"Smile, you don\'t have much left" - Me',
//         work: [Object],
//         sports: [Object],
//         education: [Object],
//         gender: 'male',
//         email: 'yuval.dimnik@gmail.com',
//         timezone: 3,
//         locale: 'en_US',
//         verified: true,
//         updated_time: '2013-08-06T09:32:25+0000'
//     }
// };

// var user = {
//     id: '123',
//     fb: profile._json,
// };

// var user = {
//     id: '456',
//     fb: profile._json,
// };

// var notified_user = user;
// var sharing_user = user;
var file_name = 'BestOfPorn668.avi';

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


exports.emails = {
    setUp: db_connect.setup,
    tearDown: db_connect.teardown,

    // 'testing mandril': function(test) {
    //     test.ifError(email.test_mandril());
    //     test.done();
    // },

    // 'send update email': function(test) {
    //     email.send_mail_changed(user, function(err, res) {
    //         // console.log(res);
    //         if (err) {
    //             console.log(JSON.stringify(err));
    //         }
    //         test.ifError(err);
    //         test.done();
    //     });
    // },

    // 'send swm notification mail': function(test) {
    //     var custom_message = 'Fuck Yeah!';
    //     email.send_swm_notification(notified_user, sharing_user, file_name, custom_message, function(err, res) {
    //         // console.log(res);
    //         if (err) {
    //             console.log(JSON.stringify(err));
    //         }
    //         test.ifError(err);
    //         test.done();
    //     });
    // },

    // 'send alpha approved notification mail': function(test) {
    //     async.waterfall([
    //         //get random user
    //         function(next) {
    //             return test_common.get_rand_entry(User, {}, next);
    //         },

    //         function(user, next) {
    //             email.send_alpha_approved_notification(user, next);
    //         },

    //     ], function(err, res) {
    //         test.ifError(err);
    //     });
    // },

    // 'get templates': function(test) {
    //     test.ifError(email.get_templates(function(err, res) {}));
    //     test.done();
    // },
    'send welcome alpha to all user types': function(test) {
        test_common.get_all_user_types(function(err, users) {
            async.eachSeries(users,email.send_alpha_approved_notification, function(err){
                test.ifError(err);
            });
            test.done();
        });
    },

    'send welcome mail': function(test) {
        test_common.get_all_user_types(function(err, users) {
            async.eachSeries(users,email.send_alpha_welcome, function(err){
                test.ifError(err);
            });
            test.done();
        });
    },

};