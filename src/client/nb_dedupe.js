'use strict';
var SHA256 = require("crypto-js/sha256");
var CryptoJS = require("crypto-js");


var nb_dedupe = angular.module('nb_dedupe', ['nb_util']);

nb_dedupe.controller('dedupeCtrl', [
    '$scope', '$http', 'dedupeSrv',
    function($scope, $http, dedupeSrv) {

        $scope.mbuffer = $scope.buffer = "LORD FIRE";
        $scope.mhasha = $scope.hasha = dedupeSrv.calc_hash_for_buff($scope.buffer);

        $scope.buff_change = function() {
            console.log('in buff change');
            $scope.mhasha = dedupeSrv.calc_hash_for_buff($scope.mbuffer);
        };

        $scope.check_hash = function(buff) {
            console.log(buff);
            return dedupeSrv.check_hash_existance(
                dedupeSrv.calc_hash_for_buff($scope.buffer),
                buff.length
            );
        };
    }
]);

nb_dedupe.factory('dedupeSrv', [
    '$http',
    function($http) {

        var calc_hash_for_buff = function(buff) {
            return SHA256(buff).toString(CryptoJS.enc.Hex);
            // hash.toString(CryptoJS.enc.Hex)); // 2f77668a9dfbf8d5848b9eeb4a7145ca94c6ed9236e4a773f6dcafa5132b2f91

        };

        var check_hash_existance = function(hash, size) {
            return $http({
                method: 'GET',
                url: '/api/hash/',
                params: {
                    hash: hash,
                    size: size
                }
            }).then(function(res) {
                console.log(res);
                // if (!res.data.found_hash_match){
                //     return false;
                // }
                
            }, function(err) {
                console.error('FAILED GET HASH', err);
            });
        };

        return {
            calc_hash_for_buff: calc_hash_for_buff,
            check_hash_existance: check_hash_existance
        };

    }
]);