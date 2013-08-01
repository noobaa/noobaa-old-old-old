var http = require('http');
var fs = require('fs');

module.exports = function(grunt) {

	// Default tasks
	grunt.registerTask('default', [
		'bower',
		'jshint'
		// 'concat',
		// 'uglify'
	]);

	// Planet - TODO
	grunt.registerTask('planet', [
		'download:node_webkit'
	]);


	// Project configuration.
	grunt.initConfig({
		pkg: grunt.file.readJSON('package.json'),
		bower: {
			install: true
		},
		jshint: {
			all: [
				'Gruntfile.js',
				'nblib/**/*.js',
				'star/**/*.js',
				'planet/js/**/*.js'
			]
		},
		// concat: {
			// js: {
			//	src: [
			//		'planet/vendor/jquery-2.0.3.min.js',
			//		'node_modules/async/lib/async.js',
			//		'bower_components/bootstrap/js/bootstrap.min.js',
			//		'planet/vendor/webrtc-adapter.js'
			//		// 'planet/js/planetfs.js',
			//		// 'planet/js/net.js',
			//		// 'planet/js/main.js'
			//	],
			//	dest: 'planet/build/concat.js'
			// },
			// css: {
			//	src: [
			//		'bower_components/bootstrap/css/bootstrap.min.css',
			//		'bower_components/bootstrap/css/bootstrap-responsive.min.css'
			//	],
			//	dest: 'planet/build/concat.css'
			// }
		// },
		// uglify: {
			// options: {
			//	banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
			// },
			// planet_bundle: {
			//	files: {
			//		'planet/build/concat.min.js': ['planet/build/concat.js']
			//	}
			// }
			// build: {
			// src: 'planet/build/<%= pkg.name %>.js',
			// dest: 'build/<%= pkg.name %>.min.js'
			// }
		// },
		download: {
			node_webkit: {
				file: 'node-webkit-v0.6.3-linux-ia32.tar.gz',
				url: 'http://s3.amazonaws.com/node-webkit/v0.6.3/node-webkit-v0.6.3-linux-ia32.tar.gz'
			}
		}
	});


	// Load the plugins
	grunt.loadNpmTasks('grunt-contrib-jshint');
	grunt.loadNpmTasks('grunt-contrib-concat');
	grunt.loadNpmTasks('grunt-contrib-uglify');


	// Define custom tasks
	grunt.task.registerMultiTask('bower', 'Bower', function() {
		// Force task into async mode and grab a handle to the "done" function.
		var done = this.async();
		grunt.util.spawn({
			cmd: './node_modules/.bin/bower',
			args: [this.target]
		}, done);
	});

	grunt.task.registerMultiTask('download', 'Download', function() {
		// Force task into async mode and grab a handle to the "done" function.
		var done = this.async();
		var file = fs.createWriteStream(this.data.file);
		http.get(this.data.url, function(res) {
			res.on('end', function() {
				done();
			});
			res.pipe(file);
		}).on('error', function(err) {
			done(false);
		});
	});
};