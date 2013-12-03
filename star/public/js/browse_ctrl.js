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

					function parents_path(inode) {
						var parents = new Array(inode.level + 1);
						var p = inode;
						for (var i = inode.level; i >= 0; i--) {
							parents[i] = p;
							p = p.parent;
						}
						return parents;
					}

					function stop_event(event) {
						if (event.stopPropagation) {
							event.stopPropagation();
						}
						return false;
					}

					function open_inode(inode, $index, $event) {
						if (inode.isdir) {
							reset_selection();
							read_dir(inode);
							$scope.dir_inode = inode;
						} else {
							inode.is_previewing = true;
							select_inode(inode, $index, $event);
							return stop_event($event);
						}
					}

					function add_selection(inode, index) {
						if (inode.is_selected) {
							return;
						}
						$scope.selection.push(inode);
						inode.is_selected = true;
						inode.select_index = index;
					}

					function remove_selection(inode) {
						if (!inode.is_selected) {
							return;
						}
						var pos = $scope.selection.indexOf(inode);
						if (pos >= 0) {
							$scope.selection.splice(pos, 1);
						}
						inode.is_selected = false;
						inode.select_index = null;
						inode.is_previewing = false;
					}

					function reset_selection() {
						var selection = $scope.selection;
						$scope.selection = [];
						if (!selection) {
							return;
						}
						for (var i = 0; i < selection.length; i++) {
							remove_selection(selection[i]);
						}
					}

					function select_inode(inode, $index, $event) {
						if ($event.ctrlKey || $event.metaKey ||
							($scope.selection.length === 1 && $scope.selection[0] === inode)) {
							console.log('SELECT TOGGLE', inode.name, inode.is_selected);
							if (inode.is_selected) {
								remove_selection(inode);
							} else {
								add_selection(inode, $index);
							}
						} else if ($event.shiftKey && $scope.selection.length) {
							var from = $scope.selection[$scope.selection.length - 1].select_index;
							console.log('SELECT FROM', from, 'TO', $index);
							if ($index >= from) {
								for (var i = from; i <= $index; i++) {
									add_selection(inode.parent.sons[i], i);
								}
							} else {
								for (var i = from; i >= $index; i--) {
									add_selection(inode.parent.sons[i], i);
								}
							}
						} else {
							console.log('SELECT ONE', inode.name);
							reset_selection();
							add_selection(inode, $index);
						}
					}

					function toggle_preview(inode) {
						inode.is_previewing = !inode.is_previewing;
					}

					function inode_source_url(inode) {
						return '/api/inode/' + inode.id;
					}

					function download_inode(inode) {
						var url = inode_source_url(inode) + '?is_download=true';
						$('<iframe style="display: none">')[0].src = url;
						// var win = window.open(url, '_blank');
						// win.focus();
					}

					function rename_inode(inode) {
					}

					function delete_inodes() {
					}

					function new_folder() {

					}

					function move_inodes() {
					}
					
					$scope.parents_path = parents_path;
					$scope.open_inode = open_inode;
					$scope.select_inode = select_inode;
					$scope.toggle_preview = toggle_preview;
					$scope.inode_source_url = inode_source_url;
					$scope.download_inode = download_inode;
					$scope.rename_inode = rename_inode;
					$scope.delete_inodes = delete_inodes;
					$scope.new_folder = new_folder;
					$scope.move_inodes = move_inodes;
				}
			]
		};
	});

})();
