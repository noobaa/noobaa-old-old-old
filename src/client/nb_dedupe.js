'use strict';
var SHA256 = require("crypto-js/sha256");
var CryptoJS = require("crypto-js");


var nb_dedupe = angular.module('nb_dedupe', ['nb_util']);

nb_dedupe.controller('dedupeCtrl', [
    '$scope', '$http', 'dedupeSrv',
    function($scope, $http, dedupeSrv) {

        $scope.mbuffer = $scope.buffer = "LORD FIRE";
        $scope.mhasha = $scope.hasha = dedupeSrv.calc_hash_for_buff($scope.buffer);
        $scope.match_found = null;

        $scope.buff_change = function() {
            console.log('in buff change');
            $scope.mhasha = dedupeSrv.calc_hash_for_buff($scope.mbuffer);
        };

        $scope.check_hash = function(buff) {
            console.log(buff);
            $scope.match_found = dedupeSrv.check_hash_existance(buff);
            return;
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

        var check_hash_existance = function(buff) {
            var lparams = {
                hash: calc_hash_for_buff(buff),
                size: buff.length
            };
            return $http({
                method: 'GET',
                url: '/api/hash/',
                params: lparams
            }).then(function(res) {
                console.log(res);
                if (!res.data.found_hash_match) {
                    console.log('Match not found. Need help on how to handle.');
                    return;
                }
                // lparams.range_offset
                check_buff_sample(buff,
                    lparams.hash,
                    res.data.range_offset,
                    res.data.range_size);
            }, function(err) {
                console.error('FAILED GET HASH', err);
            });
        };

        var check_buff_sample = function(buff, hash, range_offset, range_size) {
            console.log('in check_buff_sample');
            var lparams = {
                hash: calc_hash_for_buff(buff),
                size: buff.length,
                sample: sample_buffer(buff, range_offset, range_size)
            };
            console.log(lparams);
            return $http({
                method: 'GET',
                url: '/api/hash/',
                params: lparams
            }).then(function(res) {
                console.log(res);
                // if (!res.data.found_hash_match) {
                //     console.log('Match not found. Need help on how to handle.');
                //     return;
                // }
            }, function(err) {
                console.error('FAILED GET HASH', err);
            });

        };
        var sample_buffer = function(buff, offset, length) {
            console.log('currently returning the buff as is. Need to cut it');
            return buff;
        };

        return {
            calc_hash_for_buff: calc_hash_for_buff,
            check_hash_existance: check_hash_existance
        };

    }
]);