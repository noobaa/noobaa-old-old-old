'use strict';

var cf_config = require('../utils/cf_config');

var nb_website = angular.module('nb_website', ['nb_util']);

nb_website.controller('WebSiteCtrl', [
    '$scope', '$location', '$anchorScroll',
    '$timeout', '$interval', '$templateCache', '$sce',
    'nbUser', 'nbUtil',
    function($scope, $location, $anchorScroll,
        $timeout, $interval, $templateCache, $sce,
        nbUser, nbUtil) {

        $timeout(function() {
            $scope.logo_anima = true;
        }, 0);

        $timeout(function() {
            $scope.bg_anima = true;
        }, 1500);

        $timeout(function() {
            $scope.desc_anima = true;
        }, 4000);

        $timeout(function() {
            $scope.contact_anima = true;
        }, 6000);

        $timeout(function() {
            $scope.bg_anima2 = true;
            $scope.logo_anima2 = true;
        }, 8500);

    }
]);
