'use strict';

var _ = require('lodash');
var moment = require('moment');

var nb_blog = angular.module('nb_blog', [
    'ngRoute',
    'ngAnimate',
    'ngSanitize',
    // 'ngTouch',
    'nb_util'
]);

///////////////////
// ROUTES CONFIG //
///////////////////


nb_blog.config(['$routeProvider', '$locationProvider',
    function($routeProvider, $locationProvider) {
        $locationProvider.html5Mode(true);
        $routeProvider.when('/', {
            templateUrl: 'blog_list.html',
            controller: ['$scope', '$routeParams',
                function($scope, $routeParams) {
                    $scope.load_blogs();
                }
            ]
        }).when('/item/:headline*?', {
            templateUrl: 'blog_item.html',
            controller: ['$scope', '$routeParams',
                function($scope, $routeParams) {
                    $scope.load_blog_item($routeParams.headline);
                }
            ]
        }).otherwise({
            redirectTo: '/'
        });
    }
]);

nb_blog.controller('BlogCtrl', [
    '$scope', '$http', '$timeout', '$window', '$location', '$sce', 'nbUtil', 'nbUser',
    function($scope, $http, $timeout, $window, $location, $sce, nbUtil, nbUser) {
        $scope.nbUser = nbUser;
        $scope.click_profile = function() {
            $window.location = '/';
        };
        $scope.moment = moment;

        nbUtil.track_event('blog.load');

        $scope.load_blogs = function() {
            if ($scope.blogs) {
                return;
            }
            var yuval = {
                name: 'Yuval Dimnik',
                title: 'NooBaa\'s Co-Founder & CEO',
            };
            var guy = {
                name: 'Guy Margalit',
                title: 'NooBaa\'s',
            };
            $scope.blogs = [{
                headline: 'faq',
                subject: 'How NooBaa Works',
                image_url: '/public/images/bg1.jpg',
                time: moment("20150406", "YYYYMMDD").toDate(),
                // author: yuval,
            }, /*{
                headline: 'why-we-make-noobaa',
                subject: 'Why We Make NooBaa',
                // image_url: '/public/images/cloud.png',
                image_url: '/public/images/bg5.jpg',
                time: moment("20140407", "YYYYMMDD").toDate(),
                author: {
                    name: 'Guy Margalit',
                    title: 'NooBaa\'s Co-Founder & CTO',
                },
                summary: [
                    ''
                ].join('')
            }, {
                headline: 'trash-the-welcome-page-part-1',
                subject: 'Trash The Welcome Page',
                image_url: '/public/images/yoda.png',
                time: moment("20140406", "YYYYMMDD").toDate(),
                author: yuval,
                summary: [
                    'Envision a ring. It’s full of sand and there are 20 year-old cars ',
                    'warming their engines at its edges. In the center of the ring, ',
                    'there is a screen showing a video: “Optimizing your welcome page”. ',
                    'The narrator is very articulate: “Be simple, clear, and to the point,” ',
                    'he calls, and the cars answer in a roar...'
                ].join('')
            }*/];
            $scope.blogs_by_headline = _.indexBy($scope.blogs, 'headline');
            /*
            console.log('LOAD BLOGS');
            return $http({
                method: 'GET',
                url: '/public_api/blog/'
            }).then(function(res) {
                console.log('LOADED BLOGS', res);
                $scope.blogs = res.data.blogs;
            }).then(null, function(err) {
                console.error('FAILED LIST BLOGS', err);
                throw err;
            });
            */
        };

        $scope.load_blog_item = function(headline) {
            nbUtil.track_event('blog.item.' + headline);
            if ($scope.blog && $scope.blog.headline === headline) {
                return;
            }
            if (!$scope.blogs) {
                $scope.load_blogs();
            }
            $scope.blog = $scope.blogs_by_headline[headline];
            if (!$scope.blog) {
                $scope.blog_not_found = true;
                $scope.time_to_redirect = 10;
                var redirect_step = function() {
                    if ($scope.time_to_redirect <= 0) {
                        $location.path('/');
                    } else {
                        $scope.time_to_redirect--;
                        $timeout(redirect_step, 1000);
                    }
                };
                redirect_step();
            }

            /*
            console.log('LOAD BLOG ITEM', headline);
            return $http({
                method: 'GET',
                url: '/public_api/blog/' + headline
            }).then(function(res) {
                console.log('LOADED BLOG ITEM', res);
                $scope.blog = res.data.blog;
                if (!$scope.blog) {
                    $scope.blog_not_found = true;
                    $timeout(function() {
                        $location.path('/');
                    }, 3000);
                }
                $scope.blog_content_html = $sce.trustAsHtml($scope.blog.content_html);
            }).then(null, function(err) {
                console.error('FAILED GET BLOG', err);
                throw err;
            });
            */
        };

        $scope.blog_location = function() {
            return $location.absUrl();
        };
    }
]);
