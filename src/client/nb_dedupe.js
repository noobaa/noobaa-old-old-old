'use strict';
var SHA256 = require("crypto-js/sha256");


var nb_dedupe = angular.module('nb_dedupe', ['nb_util']);

nb_dedupe.controller('dedupeCtrl', [
    '$scope', '$http', 'dedupeSrv',
    function($scope, $http, dedupeSrv) {

        $scope.buffer = "LORD FIRE";
        $scope.hasha = "0340";

        $scope.get_hash = function(buff) {
            //            console.log('before' + $scope.buffer);
            $scope.buffer += "x";
            //          console.log('after' + $scope.buffer);
            console.log($scope.buffer);
            $scope.hasha = dedupeSrv.calc_hash_for_buff($scope.buffer);
            console.log($scope.hasha);
            // console.log(lhash);
            // return lhash;
        };
    }
]);

nb_dedupe.factory('dedupeSrv', function() {

    var calc_hash_for_buff = function(buff) {
        return SHA256(buff);
    };

    var check_buff_existance = function(buff) {
        // return 666; //TODO
    };

    return {
        calc_hash_for_buff: calc_hash_for_buff,
        check_buff_existance: check_buff_existance
    };

});