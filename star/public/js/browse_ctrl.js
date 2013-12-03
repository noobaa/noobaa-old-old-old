/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.directive('nbBrowse', function() {
		return {
			restrict: 'AE',
			replace: true,
			templateUrl: '/browse_template.html',
			controller: ['$scope', '$http', '$timeout', 'nbUploadSrv',
				function($scope, $http, $timeout, nbUploadSrv) {

					$scope.root_inode = {
						id: null,
						isdir: true,
						level: 0,
						name: 'Home',
						parents: [],
						sons: []
					};

					open_inode($scope.root_inode);

					function read_dir(dir_inode) {
						dir_inode.is_loading = true;
						return $http({
							method: 'GET',
							url: '/api/inode/' + dir_inode.id
						}).then(function(res) {
							dir_inode.is_loading = false;
							console.log('READDIR', res);
							var entries = res.data.entries;
							entries.sort(function(a, b) {
								return a.isdir ? -1 : 1;
							});
							dir_inode.sons = entries;
							for (var i = 0; i < entries.length; i++) {
								entries[i].parent = dir_inode;
								entries[i].level = dir_inode.level + 1;
							}
							return res;
						}, function(err) {
							dir_inode.is_loading = false;
							console.error('FAILED READDIR', err);
							throw err;
						});
					}

					function open_inode(inode) {
						if (!inode.isdir) {
							if ($scope.playing === inode) {
								$scope.playing = null;
							} else {
								$scope.playing = inode;
							}
						} else {
							$scope.dir_inode = inode;
							$scope.selections = {};
							$scope.last_select_index = -1;
							read_dir(inode);
						}
					}

					function select_inode(inode, $event, $index, toggle) {
						if ($event.ctrlKey || $event.metaKey || toggle === 'toggle') {
							$scope.selections[inode.id] = !$scope.selections[inode.id];
							$scope.last_select_index = $scope.selections[inode.id] ? $index : -1;
						} else if ($event.shiftKey && $scope.last_select_index >= 0) {
							if ($index >= $scope.last_select_index) {
								for (var i = $scope.last_select_index; i <= $index; i++) {
									$scope.selections[inode.parent.sons[i].id] = true;
								}
							} else {
								for (var i = $scope.last_select_index; i >= $index; i--) {
									$scope.selections[inode.parent.sons[i].id] = true;
								}
							}
						} else {
							$scope.selections = {};
							$scope.selections[inode.id] = true;
							$scope.last_select_index = $index;
						}
						$event.stopPropagation();
						return false;
					}

					function parents_path(inode) {
						var parents = new Array(inode.level + 1);
						var p = inode;
						for (var i = inode.level; i >= 0; i--) {
							parents[i] = p;
							p = p.parent;
						}
						return parents;
					}

					$scope.open_inode = open_inode;
					$scope.select_inode = select_inode;
					$scope.parents_path = parents_path;

					$scope.inode_source_url = function(inode) {
						return '/api/inode/' + inode.id;
					};
				}
			]
		};
	});

})();
