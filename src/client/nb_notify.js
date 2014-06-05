'use strict';

var _ = require('underscore');
var moment = require('moment');

var nb_util = angular.module('nb_util');



nb_util.factory('nbNotify', [
    '$http', '$timeout', '$interval', '$q',
    '$window', '$location', '$rootScope',
    'nbUtil', 'nbUser', 'nbInode',

    function($http, $timeout, $interval, $q,
        $window, $location, $rootScope,
        nbUtil, nbUser, nbInode) {

        var $scope = {};

        // TODO

        return $scope;
    }
]);


nb_util.controller('NotifyCtrl', ['$scope', '$timeout', '$interval', 'nbUtil', 'nbUser', 'nbNotify',
    function($scope, $timeout, $interval, nbUtil, nbUser, nbNotify) {

        // TODO

    }
]);
