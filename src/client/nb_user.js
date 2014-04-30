/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
    'use strict';

    var nb_util = angular.module('nb_util');

    nb_util.factory('nbUser', [
        '$http', '$timeout', '$interval', '$q', '$templateCache',
        '$rootScope', '$window', '$location', 'nbUtil',
        function($http, $timeout, $interval, $q, $templateCache,
            $rootScope, $window, $location, nbUtil) {

            var $scope = $rootScope.$new();


            var server_data_raw = $('#server_data').html();
            $scope.server_data = server_data_raw ? JSON.parse(server_data_raw) : {};
            $scope.user = $scope.server_data.user;

            // set the mixpanel identity with our user id
            if (window.nb_mixpanel && $scope.user && $scope.user.id) {
                mixpanel.identify($scope.user.id);
            }

            $scope.user_quota = -1;
            $scope.user_usage = -1;
            $scope.usage_percents = -1;

            $scope.update_user_info = update_user_info;
            $scope.user_pic_url = user_pic_url;

            function set_user_usage(quota, usage) {
                $scope.user_quota = quota;
                $scope.user_usage = usage;
                $scope.usage_percents = Math.ceil(100 * usage / quota);
            }

            function update_user_info() {
                if (!$scope.user) {
                    set_user_usage(400 * 1024 * 1024 * 1024, 250 * 1024 * 1024 * 1024);
                    return;
                }
                reset_update_user_info(true);
                return $http({
                    method: "GET",
                    url: "/api/user/",
                    params: {
                        tz_offset: -(new Date()).getTimezoneOffset()
                    }
                }).then(function(res) {
                    set_user_usage(res.data.quota, res.data.usage);
                    reset_update_user_info();
                    return res;
                }, function(err) {
                    console.log('FAILED GET USER', err);
                    reset_update_user_info();
                    throw err;
                });
            }

            function reset_update_user_info(unset) {
                $timeout.cancel($scope.timeout_update_user_info);
                $scope.timeout_update_user_info = unset ? null : $timeout(update_user_info, 300000);
            }

            function user_pic_url(user) {
                if (!user) {
                    return '/public/images/user_silhouette.png';
                }
                if (user.fbid) {
                    return 'https://graph.facebook.com/' + user.fbid + '/picture';
                }
                if (user.googleid) {
                    return 'https://plus.google.com/s2/photos/profile/' + user.googleid + '?sz=50';
                }
                return '/public/images/user_silhouette.png';
            }

            function on_fb_state_change(res) {
                $scope.fbme = null;
                // console.log('on_fb_state_change', res);
                if (res.status === 'connected') {
                    // The response object is returned with a status field that lets the app know the current
                    // login status of the person. In this case, we're handling the situation where they 
                    // have logged in to the app.
                    // testAPI();
                    FB.api('/me', function(me) {
                        // console.log('FBME', me);
                        $scope.fbme = me;
                        $rootScope.safe_apply();
                    });
                } else if (res.status === 'not_authorized') {
                    // In this case, the person is logged into Facebook, but not into the app, so we call
                    // FB.login() to prompt them to do so. 
                    // In real-life usage, you wouldn't want to immediately prompt someone to login 
                    // like this, for two reasons:
                    // (1) JavaScript created popup windows are blocked by most browsers unless they 
                    // result from direct interaction from people using the app (such as a mouse click)
                    // (2) it is a bad experience to be continually prompted to login upon page load.
                    // FB.login();
                } else {
                    // In this case, the person is not logged into Facebook, so we call the login() 
                    // function to prompt them to do so. Note that at this stage there is no indication
                    // of whether they are logged into the app. If they aren't then they'll see the Login
                    // dialog right after they log in to Facebook. 
                    // The same caveats as above apply to the FB.login() call here.
                    // FB.login();
                }
                $rootScope.safe_apply();
            }

            function on_fb_init() {
                // Here we subscribe to the auth.authResponseChange JavaScript event. This event is fired
                // for any authentication related change, such as login, logout or session refresh. This means that
                // whenever someone who was previously logged out tries to log in again, the correct case below 
                // will be handled.
                // console.log('on_fb_init');
                FB.Event.subscribe('auth.authResponseChange', on_fb_state_change);
            }

            if (window.fb_init_complete) {
                on_fb_init();
            } else {
                window.on_fb_init = on_fb_init;
            }

            $scope.open_signin = function() {
                nbUtil.track_event('home.open_signin');
                var scope = $scope.$new();
                nbUtil.content_modal('<h4>Start using your account</h4>',
                    $templateCache.get('signin_dialog.html'), scope);
                scope.ready = false;
                $timeout(function() {
                    scope.ready = true;
                }, 1000);
            };

            $scope.login_facebook = function() {
                nbUtil.track_event('login.fb').then(function() {
                    $window.location.href = '/auth/facebook/login/';
                });
            };

            $scope.login_google = function() {
                nbUtil.track_event('login.google').then(function() {
                    $window.location.href = '/auth/google/login/';
                });
            };

            $scope.login_email = function(email) {
                if (!email) {
                    return;
                }
                nbUtil.track_event('login.email', {
                    email: email
                }).then(function() {
                    nbUtil.nbinfo('Thank you! Currently we only support sign in with Facebook or Google+. ' +
                        ' We will let you know once we implement sign in with email.');
                });
            };

            $scope.logout = function() {
                nbUtil.track_event('logout').then(function() {
                    $window.location.href = '/auth/logout/';
                });
            };

            $scope.invite_friends = function() {
                if (window.fb_init_complete) {
                    // return FB.ui({
                    // 	method: 'apprequests',
                    // 	message: 'Invite to share videos with friends on NooBaa'
                    // }, function(res) {
                    // 	console.log('FB REQUEST', res);
                    // });
                    FB.ui({
                        method: 'send',
                        link: 'https://www.noobaa.com?invite_request=' + $scope.user.id
                    }, function(res) {
                        console.log('FB SEND', res);
                    });
                } else {
                    var url = 'https://www.facebook.com/dialog/send?app_id=' + $scope.server_data.app_id +
                        '&link=https://www.noobaa.com%3Finvite_request%3D' + $scope.user.id +
                        '&redirect_uri=https://www.facebook.com';
                    var win = window.open(url, '_blank');
                    win.focus();
                }
            };


            return $scope;

        }
    ]);

})();
