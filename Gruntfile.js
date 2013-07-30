module.exports = function(grunt) {


	// Default tasks
	grunt.registerTask('default', [
		'bower',
		'jshint',
		'concat'
		// 'uglify'
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
				'star/**/*.js',
				'planet/js/**/*.js'
			]
		},
		concat: {
			js: {
				src: [
					'planet/vendor/jquery-2.0.3.min.js',
					'bower_components/bootstrap/js/bootstrap.min.js',
					'planet/vendor/webrtc-adapter.js',
					'planet/js/store.js',
					'planet/js/net.js',
					'planet/js/main.js'
				],
				dest: 'planet/build/concat.js'
			},
			css: {
				src: [
					'bower_components/bootstrap/css/bootstrap.min.css',
					'bower_components/bootstrap/css/bootstrap-responsive.min.css'
				],
				dest: 'planet/build/concat.css'
			}
		}
		// uglify: {
		//	options: {
		//		banner: '/*! <%= pkg.name %> <%= grunt.template.today("yyyy-mm-dd") %> */\n'
		//	},
		//	build: {
		//		src: 'src/<%= pkg.name %>.js',
		//		dest: 'build/<%= pkg.name %>.min.js'
		//	}
		// }
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
};