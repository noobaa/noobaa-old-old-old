/* jshint browser:true, jquery:true, devel:true */
/* global angular:false */
/* global _:false */
/* global Backbone:false */
/* jshint -W099 */
(function() {
	'use strict';

	var noobaa_app = angular.module('noobaa_app');

	noobaa_app.factory('nbInode', [
		'$http', '$timeout', '$interval', '$q', '$window', '$location', '$rootScope', '$sce',
		'LinkedList', 'JobQueue', 'nbUtil', 'nbUser',

		function($http, $timeout, $interval, $q, $window, $location, $rootScope, $sce,
			LinkedList, JobQueue, nbUtil, nbUser) {

			var $scope = {
				inode_api_url: inode_api_url,
				fobj_get_url: fobj_get_url,
				seamless_open_inode: seamless_open_inode,
				download_url: download_url,
				download_inode: download_inode,
				is_root_inode: is_root_inode,
				is_my_data_dir: is_my_data_dir,
				is_swm_dir: is_swm_dir,
				is_sbm_dir: is_sbm_dir,
				is_not_mine: is_not_mine,
				can_upload_to_dir: can_upload_to_dir,
				can_upload_file: can_upload_file,
				can_share_inode: can_share_inode,
				can_keep_inode: can_keep_inode,
				can_change_inode: can_change_inode,
				can_move_inode: can_move_inode,
				can_move_to_dir: can_move_to_dir,
				ctime_newest_first_sort_func: ctime_newest_first_sort_func,
				get_inode: get_inode,
				merge_inode: merge_inode,
				merge_inode_entries: merge_inode_entries,
				load_inode: load_inode,
				read_dir: read_dir,
				is_dir_non_empty: is_dir_non_empty,
				parents_path: parents_path,
				new_folder: new_folder,
				rename_inode: rename_inode,
				move_inode: move_inode,
				recursive_delete: recursive_delete,
				recursive_copy: recursive_copy,
				get_share_list: get_share_list,
				set_share_list: set_share_list,
				mklink: mklink,
				rmlinks: rmlinks,
				share_inode: share_inode,
				unshare_inode: unshare_inode,
				keep_inode: keep_inode,
				keep_and_share: keep_and_share,
				get_inode_messages: get_inode_messages,
				post_inode_message: post_inode_message,
				delete_inode_message: delete_inode_message,
			};

			function inode_api_url(inode_id) {
				return '/api/inode/' + inode_id;
			}

			function fobj_get_url(inode) {
				if (inode.fobj_get_url) {
					return $sce.trustAsResourceUrl(inode.fobj_get_url);
				}
				return inode_api_url(inode.id);
			}

			function seamless_open_inode(inode) {
				var url = inode_api_url(inode.id) + '?seamless=1';
				var win = window.open(url, '_blank');
				win.focus();
			}

			function download_url(inode) {
				return inode_api_url(inode.id) + '?is_download=1';
			}

			function download_inode(inode) {
				console.log('DOWNLOAD INODE', inode.name, download_url(inode));
				$('<iframe style="display: none">')[0].src = download_url(inode);
				// var win = window.open(url, '_blank');
				// win.focus();
			}

			// return true for "My Data" and "Shared With Me"
			// which are user root dirs and shouldn't be modified.

			function is_root_inode(inode) {
				return !inode.parent_id;
			}

			function is_my_data_dir(inode) {
				return !inode.parent_id && inode.name === 'My Data';
			}

			function is_swm_dir(inode) {
				return !inode.parent_id && inode.name === 'Shared With Me';
			}

			function is_sbm_dir(inode) {
				return !inode.parent_id && inode.name === 'Shared By Me';
			}

			function is_not_mine(inode) {
				return !!inode.not_mine;
			}

			function can_upload_to_dir(inode) {
				return !!inode && inode.isdir && !inode.not_mine && !inode.ref_owner && !inode.ro;
			}

			function can_upload_file(inode) {
				return !!inode && can_upload_to_dir(inode.parent) && !inode.isdir && inode.uploading;
			}

			function can_share_inode(inode) {
				return !!inode && !inode.not_mine && !inode.ref_owner && !! inode.parent_id;
			}

			function can_keep_inode(inode) {
				return !!inode && ( !! inode.ref_owner || !! inode.not_mine);
			}

			function can_change_inode(inode) {
				return !!inode && !inode.not_mine && !! inode.parent_id;
			}

			function can_move_inode(inode) {
				return !!inode && !inode.not_mine && !inode.ref_owner && !! inode.parent_id;
			}

			function can_move_to_dir(inode) {
				return !!inode && !inode.not_mine && !inode.ref_owner && !inode.ro;
			}

			var CONTENT_KINDS = {
				'image': 'image',
				'video': 'video',
				'audio': 'audio',
				'text': 'text',
			};

			function sync_missing_key(target, src, key) {
				// remove the key from the target object 
				// according to it's state in the source object
				if (!src[key]) {
					delete target[key];
				}
			}

			function ctime_newest_first_sort_func(a, b) {
				return a.ctime > b.ctime ? -1 : 1;
			}

			function default_sort_func(a, b) {
				return a.isdir ? -1 : 1;
			}

			var inodes_cache = {};

			var inodes_lru = new LinkedList('lru');

			inodes_cache['null'] = {
				id: null,
				isdir: true,
				ro: true,
				name: 'My Items',
			};

			inodes_cache.sbm = {
				id: 'sbm',
				isdir: true,
				ro: true,
				name: 'Shared By Me',
			};

			function get_inode(inode_id, peek) {
				inode_id = inode_id || 'null';
				var inode = inodes_cache[inode_id];
				if (!inode) {
					// if (peek === 'peek') { // uncomment if needed
					// return null;
					// }
					inodes_cache[inode_id] = inode = {
						id: inode_id
					};
				}
				// bump to front of lru
				inodes_lru.remove(inode);
				inodes_lru.push_front(inode);
				return inode;
			}

			function discard_inode(inode_id) {
				var inode = inodes_cache[inode_id];
				inodes_lru.remove(inode);
				delete inodes_cache[inode_id];
			}

			function merge_inode(entry) {
				if (entry.isdir) {
					entry.content_kind = 'dir';
				} else if (entry.content_type) {
					entry.content_kind = CONTENT_KINDS[entry.content_type.split('/')[0]];
				}
				entry.ctime = new Date(entry.ctime);
				var inode = get_inode(entry.id);
				angular.extend(inode, entry);
				// turn off the uploading flag because we don't send each time
				// and extend won't turn off when the key is missing
				sync_missing_key(inode, entry, 'uploading');
				sync_missing_key(inode, entry, 'shr');
				if (entry.entries) {
					inode.entries = merge_inode_entries(entry.entries);
					inode.entries.sort(inode.sorting_func || default_sort_func);
					inode.entries_by_kind = _.groupBy(inode.entries, 'content_kind');
				}
				return inode;
			}

			function merge_inode_entries(entries) {
				return _.map(entries, merge_inode);
			}

			function load_inode(inode, force_load, retries) {

				if (inode.loaded && force_load !== 'force') {
					var now = Date.now();
					if (now < inode.loaded + 5000 && now > inode.loaded) {
						// console.log('ALREADY LOADED', inode.name);
						return $q.when(inode);
					}
				}
				// handle the virtual folder sbm
				var url = '/api/inode/';
				var params = {
					metadata: true
				};
				if (inode.id === 'sbm') {
					params.sbm = true;
				} else {
					url += inode.id;
				}

				// console.log('LOAD INODE', inode);
				inode.is_loading = true;
				return $http({
					method: 'GET',
					url: url,
					params: params
				}).then(function(res) {
					inode.is_loading = false;
					inode.loaded = Date.now();
					var entry = res.data;
					if (!inode.id) {
						entry.entries.push(inodes_cache.sbm);
					} else if (params.sbm) {
						entry.id = 'sbm';
					}
					// console.log('LOAD INODE', inode, entry);
					return merge_inode(entry);
				}).then(null, function(err) {
					inode.is_loading = false;
					console.error('FAILED LOAD INODE', err);
					if (!retries) {
						throw err;
					}
					return $timeout(function() {
						load_inode(inode, force_load, retries - 1);
					}, 3000);
				});
			}

			// TODO TEMPORARY

			function read_dir(inode) {
				return load_inode(inode, 'force');
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
				var parents = [];
				var p = inode;
				do {
					p = get_inode(p.parent_id);
					parents.push(p);
				} while (p && p.id);
				// console.log('PARENTS', parents);
				return parents;
			}





			function new_folder(dir_inode) {
				if (!dir_inode) {
					console.error('no selected dir, bailing');
					return;
				}
				// check dir creation conditions
				// the first condition is true when looking at a directory 
				// which is not owned by the user.
				// the second is true for ghosts or when not owned by the user
				if (is_not_mine(dir_inode) || dir_inode.ref_owner) {
					nbUtil.nbalert('Cannot create folder in someone else\'s folder');
					return;
				}
				var dlg = $('#mkdir_dialog').clone();
				var input = dlg.find('#dialog_input');
				input.val('');
				dlg.find('.inode_label').html(dir_inode.name);
				dlg.find('#dialog_ok').off('click').on('click', function() {
					dlg.nbdialog('close');
					if (!input.val()) {
						return;
					}
					return $http({
						method: 'POST',
						url: '/api/inode/',
						data: {
							id: dir_inode.id,
							name: input.val(),
							isdir: true
						}
					}).then(function(res) {
						load_inode(dir_inode, 'force');
						return res;
					}, function(err) {
						load_inode(dir_inode, 'force');
						throw err;
					});
				});
				dlg.nbdialog('open', {
					remove_on_close: true,
					modal: true
				});
			}


			function rename_inode(inode) {
				if (!inode) {
					console.error('no inode to rename, bailing');
					return;
				}
				if (is_root_inode(inode)) {
					nbUtil.nbalert('Cannot rename root folder');
					return;
				}
				if (is_not_mine(inode)) {
					nbUtil.nbalert('Cannot rename someone else\'s file');
					return;
				}

				var dlg = $('#rename_dialog').clone();
				var input = dlg.find('#dialog_input');
				input.val(inode.name);
				dlg.find('.inode_label').html(inode.name);
				dlg.find('#dialog_ok').off('click').on('click', function() {
					dlg.nbdialog('close');
					if (!input.val() || input.val() === inode.name) {
						return;
					}
					return $http({
						method: 'PUT',
						url: '/api/inode/' + inode.id,
						data: {
							name: input.val()
						}
					}).then(function(res) {
						load_inode(inode, 'force');
						return res;
					}, function(err) {
						load_inode(inode, 'force');
						throw err;
					});
				});
				dlg.nbdialog('open', {
					remove_on_close: true,
					modal: true
				});
			}

			function move_inode(inode, dir_inode) {
				// console.log('MOVE', inode.name, dir_inode.name);
				if (!can_move_inode(inode)) {
					nbUtil.nbalert('Cannot move item');
					return;
				}
				if (!can_move_to_dir(dir_inode)) {
					nbUtil.nbalert('Cannot move into selected folder');
					return;
				}
				var p = dir_inode;
				while (p) {
					if (p.id === inode.id) {
						nbUtil.nbalert('Cannot create circular folders. It\'s just wrong...');
						return;
					}
					p = p.parent;
				}
				if (inode.parent_id === dir_inode.id) {
					console.log('move into same parent. nothing to do.');
					return;
				}
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode.id,
					data: {
						parent: dir_inode.id,
					}
				});
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

			function single_copy(inode, new_parent_id, new_name) {
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode.id + '/copy',
					data: {
						new_parent_id: new_parent_id,
						new_name: new_name,
					}
				});
			}

			function recurse_dir_copy(dir_inode, new_dir_id, copy_scope) {
				copy_scope.concurrency++;
				return read_dir(dir_inode).then(function() {
					copy_scope.concurrency--;
					var sons = dir_inode.entries.slice(0); // copy array
					var copy_sons = function() {
						if (!sons || !sons.length) {
							return $q.when();
						}
						var promises = [];
						while (copy_scope.concurrency < copy_scope.max_concurrency && sons.length) {
							promises.push(recursive_copy(sons.pop(), copy_scope, new_dir_id, null).then(copy_sons));
						}
						return $q.all(promises);
					};
					return copy_sons();
				}, function(err) {
					copy_scope.concurrency--;
					console.error('FAILED DIR COPY', dir_inode, err);
					throw err;
				});
			}

			function recursive_copy(inode, copy_scope, new_parent_id, new_name) {
				copy_scope.concurrency++;
				return single_copy(inode, new_parent_id, new_name).then(function(res) {
					copy_scope.concurrency--;
					copy_scope.count++;
					var new_inode_id = res.data.id;
					if (inode.isdir) {
						return recurse_dir_copy(inode, new_inode_id, copy_scope);
					}
				}, function(err) {
					copy_scope.concurrency--;
					console.error('FAILED RECURSE COPY', inode, err);
					throw err;
				});
			}

			function copy_inode(inode, dir_inode) {
				if (!inode) {
					console.error('no selected inode, bailing');
					return;
				}
				if (is_root_inode(inode)) {
					nbUtil.nbalert('Cannot copy root folder');
					return;
				}

				var copy_scope = $rootScope.$new();
				copy_scope.count = 0;
				copy_scope.concurrency = 0;
				copy_scope.max_concurrency = 32;

				var new_inode;
				var deferred = $q.defer(); // using a new defer for notifying on the top inode copy
				single_copy(inode, dir_inode.id).then(function(res) {
					copy_scope.count++;
					new_inode = res.data;
					deferred.notify(new_inode);
				}).then(function() {
					if (inode.isdir) {
						return recurse_dir_copy(inode, new_inode.id, copy_scope);
					}
				}).then(function(res) {
					deferred.resolve(res);
				}, function(err) {
					console.error('FAILED COPY', inode, err);
					deferred.reject(err);
				});
				return deferred.promise;
			}


			function get_share_list(inode_id) {
				// console.log('get_share_list', inode_id);
				return $http({
					method: 'GET',
					url: '/api/inode/' + inode_id + '/share_list'
				});
			}

			function set_share_list(inode_id, shr, share_list) {
				// console.log('share', inode_id, 'with', share_list);
				return $http({
					method: 'PUT',
					url: '/api/inode/' + inode_id + '/share_list',
					data: {
						shr: shr,
						share_list: share_list
					}
				});
			}

			function mklink(inode, link_options) {
				console.log('mklink', inode, link_options);
				return $http({
					method: 'POST',
					url: '/api/inode/' + inode.id + '/link',
					data: {
						link_options: link_options
					}
				});
			}

			function rmlinks(inode) {
				console.log('revoke_links', inode);
				return $http({
					method: 'DELETE',
					url: '/api/inode/' + inode.id + '/link'
				});
			}

			function mark_all_share_list(share_list, value) {
				for (var i = 0; i < share_list.length; i++) {
					share_list[i].shared = value;
				}
			}

			function share_inode(inode, on_share_done) {
				if (!inode) {
					console.error('no selected inode, bailing');
					return;
				}
				if (!can_share_inode(inode)) {
					nbUtil.nbalert('Cannot share item');
					return;
				}

				var modal;
				var share_scope = $rootScope.$new();
				share_scope.nbUtil = nbUtil;
				share_scope.nbUser = nbUser;
				share_scope.share_inode = inode;
				share_scope.shr = 'f';
				share_scope.run = function() {
					share_scope.share_list_loading = true;
					var sl_promise = set_share_list(inode.id, share_scope.shr, share_scope.share_list);
					var msg_promise = post_inode_message(inode, share_scope.share_text);
					$q.all([sl_promise, msg_promise]).then(function(res) {
						share_scope.share_list_loading = false;
						modal.modal('hide');
						if (on_share_done) {
							on_share_done();
						}
					}, function() {
						share_scope.share_list_loading = false;
					});
				};
				share_scope.delete_inode_message = delete_inode_message;
				// share_scope.mark_all = function(value) {
				// 	mark_all_share_list(share_scope.share_list, value);
				// };
				share_scope.load_share_list = function() {
					share_scope.share_list_loading = true;
					return get_share_list(inode.id).then(function(res) {
						share_scope.share_list_loading = false;
						share_scope.share_list = res.data.list;
					}, function(err) {
						share_scope.share_list_loading = false;
						console.error('FAILED GET SHARE LIST', err);
					});
				};
				share_scope.set_shr_refs = function() {
					share_scope.shr = 'r';
					return share_scope.load_share_list();
				};
				share_scope.get_messages = function() {
					share_scope.comments_loading = true;
					get_inode_messages(inode).then(function() {
						share_scope.comments_loading = false;
					}, function(err) {
						share_scope.comments_loading = true;
						console.error('FAILED GET MESSAGES', err);
					});
				};
				if (inode.shr === 'r') {
					share_scope.load_share_list().then(function() {
						// on load check the list and init the scope.
						// when no friends, go to friends view.
						if (!share_scope.share_list.length) {
							modal.modal('hide');
							modal = null;
							$location.path('/friends/');
						} else {
							var counts = _.countBy(share_scope.share_list, 'shared');
							if (!counts[true]) {
								share_scope.shr = 'f';
							} else {
								share_scope.shr = 'r';
							}
						}
					});
				}
				share_scope.get_messages();
				modal = nbUtil.modal($('#share_modal').html(), share_scope);
			}

			function unshare_inode(inode) {
				return set_share_list(inode.id, undefined, undefined);
			}


			function keep_inode(inode, dir_inode) {
				if (!inode.ref_owner && !inode.not_mine) {
					return $q.when(inode);
				}
				if (inode.new_keep_inode) {
					return $q.when(inode.new_keep_inode);
				}
				var new_keep_inode_promise;
				inode.running_keep = (inode.running_keep || 0) + 1;
				return copy_inode(inode, dir_inode).then(function(res) {
					inode.running_keep--;
					inode.done_keep = true;
					var notify_message = '"' + inode.name + '" was added to My-Data';
					// if (copy_scope.count !== 1) {
					// notify_message += ' (' + copy_scope.count + ' items)';
					// }
					$.bootstrapGrowl(notify_message, {
						ele: 'body',
						type: 'danger',
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
					return new_keep_inode_promise;
				}, function(err) {
					inode.running_keep--;
					throw err;
				}, function(new_inode) {
					new_keep_inode_promise = read_dir(dir_inode).then(function() {
						inode.new_keep_inode = get_inode(new_inode.id);
						return inode.new_keep_inode;
					});
				});
			}

			function keep_and_share(inode, dir_inode, on_share_done) {
				return keep_inode(inode, dir_inode).then(function(kept_inode) {
					// run this immediately after top inode is copied
					return share_inode(kept_inode, on_share_done);
				});
			}

			function get_inode_messages(inode) {
				return $http({
					method: 'GET',
					url: '/api/inode/' + inode.id + '/message/'
				}).then(function(res) {
					// console.log('GOT MSGS');
					inode.messages = res.data;
					return res;
				}, function(err) {
					console.error('FAILED GET MSGS', inode, err);
					throw err;
				});
			}

			function post_inode_message(inode, text) {
				if (!text) {
					return;
				}
				return $http({
					method: 'POST',
					url: '/api/inode/' + inode.id + '/message/',
					data: {
						text: text
					}
				}).then(function(res) {
					console.log('POSTED MSG');
					return res;
				}, function(err) {
					console.error('FAILED POST MSG', inode, err);
					throw err;
				});
			}

			function delete_inode_message(inode, msg) {
				if (!$window.confirm('Remove this comment?')) {
					return;
				}
				return $http({
					method: 'DELETE',
					url: '/api/inode/' + inode.id + '/message/' + msg.id,
				}).then(function(res) {
					console.log('DELETED MSG', inode.id, msg.id);
					return res;
				}, function(err) {
					console.error('FAILED DEL MSG', inode.id, msg.id, err);
					throw err;
				}).then(function() {
					return get_inode_messages(inode);
				});
			}


			return $scope;

		}
	]);

})();
