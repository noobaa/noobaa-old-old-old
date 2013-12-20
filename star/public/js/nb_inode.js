/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbInode', [
		'$http', '$timeout', '$interval', '$q', '$rootScope', 'JobQueue',
		function($http, $timeout, $interval, $q, $rootScope, JobQueue) {

			var $scope = {
				inode_api_url: inode_api_url,
				seamless_open_inode: seamless_open_inode,
				download_inode: download_inode,
				is_immutable_root: is_immutable_root,
				is_shared_with_me: is_shared_with_me,
				is_not_mine: is_not_mine,
				can_upload_to_dir: can_upload_to_dir,
				can_upload_file: can_upload_file,
				can_share_inode: can_share_inode,
				can_keep_inode: can_keep_inode,
				init_root_dir: init_root_dir,
				read_dir: read_dir,
				read_file_attr: read_file_attr,
				is_dir_non_empty: is_dir_non_empty,
				parents_path: parents_path,
				recursive_delete: recursive_delete,
				recursive_copy: recursive_copy,
				copy_inode: copy_inode,
			};

			function inode_api_url(inode_id) {
				return '/api/inode/' + inode_id;
			}

			function inode_call(method, inode_id) {
				return {
					method: method,
					url: '/api/inode/' + inode_id
				};
			}

			function seamless_open_inode(inode) {
				var url = inode_api_url(inode.id) + '?seamless=1';
				var win = window.open(url, '_blank');
				win.focus();
			}

			function download_inode(inode) {
				var url = inode_api_url(inode) + '?is_download=true';
				$('<iframe style="display: none">')[0].src = url;
				// var win = window.open(url, '_blank');
				// win.focus();
			}

			// return true for "My Data" and "Shared With Me"
			// which are user root dirs and shouldn't be modified.

			function is_immutable_root(inode) {
				return !inode.parent || !inode.parent.parent;
			}

			function is_shared_with_me(inode) {
				return inode.swm; // TODO NEED TO FILL THIS OR REMOVE
			}

			function is_not_mine(inode) {
				return inode.not_mine;
			}

			function can_upload_to_dir(inode) {
				return inode && inode.isdir && !inode.swm && inode.level > 0;
			}

			function can_upload_file(inode) {
				return inode && can_upload_to_dir(inode.parent) && !inode.isdir && inode.uploading;
			}

			function can_share_inode(inode) {
				return inode && !inode.swm && inode.level > 1;
			}

			function can_keep_inode(inode) {
				return inode && inode.swm && inode.level > 1;
			}

			function init_root_dir() {
				return {
					id: null,
					parent: null,
					level: 0,
					isdir: true,
					name: 'Collection',
					entries: [],
					entries_map: {}
				};
			}

			var CONTENT_KINDS = {
				'image': 'image',
				'video': 'video',
				'audio': 'audio',
				'text': 'text',
			};

			function read_dir(dir_inode) {
				console.log('READDIR', dir_inode.name);
				dir_inode.is_loading = true;
				return $http(inode_call('GET', dir_inode.id)).then(function(res) {
					dir_inode.is_loading = false;
					console.log('READDIR OK', dir_inode.name);
					var entries = res.data.entries;
					dir_inode.entries = entries;
					dir_inode.entries_map = dir_inode.entries_map || {};
					var entries_map = {};
					for (var i = 0; i < entries.length; i++) {
						var e = dir_inode.entries_map[entries[i].id];
						if (!e) {
							e = entries[i];
						} else {
							angular.extend(e, entries[i]);
						}
						if (e.content_type) {
							e.content_kind = CONTENT_KINDS[e.content_type.split('/')[0]] || e.content_type;
						}
						if (dir_inode.swm) {
							e.swm = dir_inode.swm;
						}
						e.parent = dir_inode;
						e.level = dir_inode.level + 1;
						if (e.ctime) {
							e.ctime_date = new Date(e.ctime);
							e.ctime_display = e.ctime_date.toLocaleDateString();
						}
						entries[i] = e;
						entries_map[e.id] = e;
					}
					entries.sort(dir_inode.sorting_func || function(a, b) {
						return a.isdir ? -1 : 1;
					});
					dir_inode.entries_map = entries_map;
					return res;
				}, function(err) {
					dir_inode.is_loading = false;
					console.error('FAILED READDIR', err);
					return $timeout(function() {
						read_dir(dir_inode);
					}, 3000);
				});
			}

			// TODO UNNEEDED

			function read_file_attr(inode) {
				return $http(inode_call('HEAD', inode.id)).then(function(res) {
					inode.content_type = res.headers('Content-Type');
					if (e.content_type) {
						e.content_kind = CONTENT_KINDS[e.content_type.split('/')[0]] || e.content_type;
					}
					console.log('HEAD', inode.content_type, inode.content_kind);
				}, function(err) {
					console.error('FAILED HEAD', err);
					throw err;
				});
			}

			function is_dir_non_empty(inode, callback) {
				if (!inode.isdir) {
					callback(false);
					return;
				}
				var promise = read_dir(inode);
				if (!promise) {
					callback( !! inode.entries.length);
				} else {
					promise.then(function(res) {
						callback( !! inode.entries.length);
						return res;
					}, function(err) {
						callback( !! inode.entries.length);
						throw err;
					});
				}
			}

			function parents_path(inode) {
				if (!inode) {
					return;
				}
				var parents = new Array(inode.level);
				var p = inode.parent;
				for (var i = inode.level - 1; i >= 0; i--) {
					parents[i] = p;
					p = p.parent;
				}
				return parents;
			}

			function recursive_delete(inodes, del_scope, complete) {
				var jobq = new JobQueue($timeout, 32);
				var do_delete = function(inode_id, ctx) {
					if (!inode_id) {
						ctx.complete();
						return;
					}
					return $http({
						method: 'DELETE',
						url: '/api/inode/' + inode_id
					})['finally'](function() {
						del_scope.count++;
						ctx.count--;
						if (ctx.count === 0) {
							jobq.add({
								run: do_delete.bind(null, ctx.inode_id, ctx.parent || ctx)
							});
						}
					});
				};
				var add_recurse_job = function(inode, ctx) {
					jobq.add({
						run: delete_recurse.bind(null, {
							entries: inode.entries,
							count: inode.entries.length,
							inode_id: inode.id,
							parent: ctx
						})
					});
				};
				var delete_recurse = function(ctx) {
					if (!ctx.entries.length) {
						do_delete(ctx.inode_id, ctx.parent || ctx);
					}
					for (var i = 0; i < ctx.entries.length; i++) {
						var inode = ctx.entries[i];
						if (inode.isdir && !ctx.skip_read_dir) {
							read_dir(inode).then(
								add_recurse_job.bind(null, inode, ctx),
								do_delete.bind(null, inode.id, ctx));
						} else if (inode.isdir && inode.entries.length) {
							add_recurse_job(inode, ctx);
						} else {
							jobq.add({
								run: do_delete.bind(null, inode.id, ctx)
							});
						}
					}
				};
				delete_recurse({
					entries: inodes,
					count: inodes.length,
					skip_read_dir: true,
					complete: complete
				});
			}

			function recursive_copy(inode, copy_scope, new_parent_id, new_name) {
				copy_scope.concurrency++;
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode.id + '/copy',
					data: {
						new_parent_id: new_parent_id,
						new_name: new_name,
					}
				}).then(function(results) {
					copy_scope.concurrency--;
					copy_scope.count++;
					if (!inode.isdir) {
						return $q.when();
					}
					var new_parent_id = results.data.id;
					copy_scope.concurrency++;
					return read_dir(inode).then(function() {
						copy_scope.concurrency--;
						var sons = inode.entries.slice(0); // copy array
						var copy_sons = function() {
							if (!sons || !sons.length) {
								return $q.when();
							}
							var promises = [];
							while (copy_scope.concurrency < copy_scope.max_concurrency && sons.length) {
								promises.push(recursive_copy(sons.pop(), copy_scope, new_parent_id, null).then(copy_sons));
							}
							return $q.all(promises);
						};
						return copy_sons();
					});
				}).
				catch (function(err) {
					console.error('FAILED COPY', inode, err);
					throw err;
				});
			}

			function copy_inode(inode) {
				if (!inode) {
					console.error('no selected inode, bailing');
					return;
				}
				if (is_immutable_root(inode)) {
					$.nbalert('Cannot copy root folder');
					return;
				}

				var copy_scope = $rootScope.$new();
				copy_scope.count = 0;
				copy_scope.concurrency = 0;
				copy_scope.max_concurrency = 32;

				// TODO OPEN FOLDER CHOOSER

				var on_copy = function() {
					var notify_message = '"' + inode.name + '" was copied to My-Data';
					if (copy_scope.count !== 1) {
						notify_message += ' (' + copy_scope.count + ' items)';
					}
					$.bootstrapGrowl(notify_message, {
						ele: 'body',
						type: 'info',
						offset: {
							from: 'top',
							amount: 60
						},
						align: 'right',
						width: 'auto',
						delay: 5000,
						allow_dismiss: true,
						stackup_spacing: 20
					});
				};
				return recursive_copy(inode, copy_scope).then(on_copy, on_copy);
			}


			return $scope;

		}
	]);

})();
