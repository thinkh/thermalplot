// Generated on 2014-01-08 using generator-angular 0.7.1
'use strict';

// # Globbing
// for performance reasons we're only matching one level down:
// 'test/spec/{,*/}*.js'
// use this if you want to recursively match all subfolders:
// 'test/spec/**/*.js'

module.exports = function (grunt) {

  // Load grunt tasks automatically
  require('load-grunt-tasks')(grunt);

  // Time how long tasks take. Can help when optimizing build times
  require('time-grunt')(grunt);

  //grunt.loadNpmTasks("grunt-ts");
  //grunt.loadNpmTasks('grunt-tsd');
  grunt.loadNpmTasks('grunt-license-bower');

  // Define the configuration for all the tasks
  grunt.initConfig({

    // Project settings
    yeoman: {
      // configurable paths
      app: require('./bower.json').appPath || 'app',
      dist: 'dist',
      release: '../../server/tornado/html'
    },

    // Watches files for changes and runs tasks based on the changed files
    watch: {
      //ts: {
      //  files: ['<%= yeoman.app %>/scripts/{,*/}*.ts'],
      //  tasks: ['newer:ts:build'],
      //  options: {
      //    livereload: true
      //  }
      //},
      //js: {
      //  files: ['<%= yeoman.app %>/scripts/{,*/}*.js'],
      //  tasks: ['newer:jshint:all'],
      //  options: {
      //    livereload: true
      //  }
      //},
      //jsTest: {
      //  files: ['test/spec/{,*/}*.js'],
      //  tasks: ['newer:jshint:test']
      //},
      //compass: {
      //  files: ['<%= yeoman.app %>/styles/{,*/}*.{scss,sass}'],
      //  tasks: ['compass:server', 'autoprefixer']
      //},
      sass: {
        files: ['<%= yeoman.app %>/styles/{,*/}*.{scss,sass}'],
        tasks: ['sass:dev', 'autoprefixer']
      },
      gruntfile: {
        files: ['Gruntfile.js']
      },
      livereload: {
        options: {
          livereload: '<%= connect.options.livereload %>'
        },
        files: [
          '<%= yeoman.app %>/{,*/}*.html',
          '.tmp/styles/{,*/}*.css',
          '<%= yeoman.app %>/images/{,*/}*.{png,jpg,jpeg,gif,webp,svg}'
        ]
      }
    },

    // The actual grunt server settings
    connect: {
      options: {
        port: 9000,
        // Change this to '0.0.0.0' to access the server from outside.
        // hostname: 'localhost', // use this if you run grunt on your host machine
        hostname: '0.0.0.0', // use this if you run grunt inside your vagrant box
        livereload: 35729
      },
      livereload: {
        options: {
          open: true,
          base: [
            '.tmp',
            '<%= yeoman.app %>'
          ]
        }
      },
      test: {
        options: {
          port: 9001,
          base: [
            '.tmp',
            'test',
            '<%= yeoman.app %>'
          ]
        }
      },
      dist: {
        options: {
          base: '<%= yeoman.dist %>'
        }
      }
    },

    // Make sure code styles are up to par and there are no obvious mistakes
    jshint: {
      options: {
        jshintrc: '.jshintrc',
        reporter: require('jshint-stylish')
      },
      all: [
        'Gruntfile.js',
        '<%= yeoman.app %>/scripts/{,*/}*.js'
      ],
      test: {
        options: {
          jshintrc: 'test/.jshintrc'
        },
        src: ['test/spec/{,*/}*.js']
      }
    },

    // Empties folders to start fresh
    clean: {
      dist: {
        files: [{
          dot: true,
          src: [
            '.tmp',
            '<%= yeoman.dist %>/*',
            '!<%= yeoman.dist %>/.git*'
          ]
        }]
      },
      release: {
        files: [{
          dot: true,
          src: [
            '.tmp',
            '<%= yeoman.release %>/*',
            '!<%= yeoman.release %>/.git*'
          ]
        }],
        options: {
          force: true
        }
      },
      server: '.tmp'
    },

    // Add vendor prefixed styles
    autoprefixer: {
      options: {
        browsers: ['last 1 version']
      },
      dist: {
        files: [{
          expand: true,
          cwd: '<%= yeoman.app %>/styles',
          src: '{,*/}*.css',
          dest: '<%= yeoman.app %>/styles'
        }]
      }
    },

    // Automatically inject Bower components into the app
    'bower-install': {
      app: {
        html: '<%= yeoman.app %>/index.html',
        ignorePath: '<%= yeoman.app %>/'
      }
    },
    wiredep: {
      indexhtml: {
        src: [
          '<%= yeoman.app %>/index.html'
        ],
        options: {
          exclude: [],
          ignorePath: '<%= yeoman.app %>/'
          // https://github.com/taptapship/wiredep#configuration
        }
      }
    },

    sass: {
      dist: {                            // target                             
        options: {                      // dictionary of render options
          sourceMap: false
        },
        files: [{
          expand: true,
          cwd: '<%= yeoman.app %>/styles',
          src: '{,*/}*.{scss,sass}',
          dest: '<%= yeoman.app %>/styles',
          ext: '.css'
        }]
      },
      dev: {                              // another target
        options: {                      // dictionary of render options
          sourceMap: true
        },
        files: [{
          expand: true,
          cwd: '<%= yeoman.app %>/styles',
          src: '{,*/}*.{scss,sass}',
          dest: '<%= yeoman.app %>/styles',
          ext: '.css'
        }]
      }
    },

    // Renames files for browser caching purposes
    rev: {
      dist: {
        files: {
          src: [
            '<%= yeoman.dist %>/scripts/{,*/}*.js',
            '<%= yeoman.dist %>/styles/{,*/}*.css',
            '<%= yeoman.dist %>/images/{,*/}*.{png,jpg,jpeg,gif,webp,svg}',
            '<%= yeoman.dist %>/styles/fonts/*'
          ]
        }
      }
    },

    // Reads HTML for usemin blocks to enable smart builds that automatically
    // concat, minify and revision files. Creates configurations in memory so
    // additional tasks can operate on them
    useminPrepare: {
      html: ['<%= yeoman.app %>/index.html', '<%= yeoman.app %>/views/{,*/}*.html'],
      options: {
        dest: '<%= yeoman.dist %>'
      }
    },

    // Performs rewrites based on rev and the useminPrepare configuration
    usemin: {
      html: ['<%= yeoman.dist %>/{,*/}*.html', '<%= yeoman.dist %>/views/{,*/}*.html'],
      css: ['<%= yeoman.dist %>/styles/{,*/}*.css'],
      options: {
        assetsDirs: ['<%= yeoman.dist %>']
      }
    },

    // The following *-min tasks produce minified files in the dist folder
    imagemin: {
      dist: {
        files: [{
          expand: true,
          cwd: '<%= yeoman.app %>/images',
          src: '{,*/}*.{png,jpg,jpeg,gif}',
          dest: '<%= yeoman.dist %>/images'
        }]
      }
    },
    svgmin: {
      dist: {
        files: [{
          expand: true,
          cwd: '<%= yeoman.app %>/images',
          src: '{,*/}*.svg',
          dest: '<%= yeoman.dist %>/images'
        }]
      }
    },
    htmlmin: {
      dist: {
        options: {
          collapseWhitespace: true,
          collapseBooleanAttributes: true,
          removeCommentsFromCDATA: true,
          removeOptionalTags: true
        },
        files: [{
          expand: true,
          cwd: '<%= yeoman.dist %>',
          src: ['*.html', 'views/{,*/}*.html'],
          dest: '<%= yeoman.dist %>'
        }]
      }
    },

    // Allow the use of non-minsafe AngularJS files. Automatically makes it
    // minsafe compatible so Uglify does not destroy the ng references
    ngAnnotate: {
      dist: {
        files: [{
          expand: true,
          cwd: '.tmp/concat/scripts',
          src: '*.js',
          dest: '.tmp/concat/scripts'
        }]
      }
    },

    // Copies remaining files to places other tasks can use
    copy: {
      dist: {
        files: [{
          expand: true,
          dot: true,
          cwd: '<%= yeoman.app %>',
          dest: '<%= yeoman.dist %>',
          src: [
            '*.{ico,png,txt}',
            '.htaccess',
            '*.html',
            'views/**/*.html',
            'bower_components/**/*',
            'images/**/*.{webp}',
            'fonts/*'
          ]
        }, {
          expand: true,
          cwd: '.tmp/images',
          dest: '<%= yeoman.dist %>/images',
          src: ['generated/*']
        }]
      },
      distd: {
        files: [{
          expand: true,
          dot: true,
          cwd: '<%= yeoman.app %>',
          dest: '<%= yeoman.dist %>',
          src: [
            '*.{ico,png,txt}',
            '.htaccess',
            '*.html',
            'views/**/*.html',
            'bower_components/**/*',
            'images/**/*',
            'fonts/*',
            'scripts/**/*.js'
          ]
        },{
          expand: true,
          dot: true,
          cwd: '.tmp',
          dest: '<%= yeoman.dist %>',
          src: [
            'styles/**/*.css'
          ]
        }]
      },
      release: {
        files: [{
          expand: true,
          dot: true,
          cwd: '<%= yeoman.app %>',
          dest: '<%= yeoman.release %>',
          src: [
            '*.{ico,png,txt}',
            '.htaccess',
            '*.html',
            'views/**/*.html',
            'bower_components/**/*',
            'images/**/*',
            'fonts/*',
            'scripts/**/*.js'
          ]
        },{
          expand: true,
          dot: true,
          cwd: '.tmp',
          dest: '<%= yeoman.release %>',
          src: [
            'styles/**/*.css'
          ]
        }]
      },
      styles: {
        expand: true,
        cwd: '<%= yeoman.app %>/styles',
        dest: '.tmp/styles/',
        src: '**/*.css'
      }
    },

    // Run some tasks in parallel to speed up the build process
    concurrent: {
      test: [
        'sass:dist'
      ],
      dist: [
        'sass:dist',
        'imagemin',
        'svgmin'
      ]
    },

    // By default, your `index.html`'s <!-- Usemin block --> will take care of
    // minification. These next options are pre-configured if you do not wish
    // to use the Usemin blocks.
    // cssmin: {
    //   dist: {
    //     files: {
    //       '<%= yeoman.dist %>/styles/main.css': [
    //         '.tmp/styles/{,*/}*.css',
    //         '<%= yeoman.app %>/styles/{,*/}*.css'
    //       ]
    //     }
    //   }
    // },
    // uglify: {
    //   dist: {
    //     files: {
    //       '<%= yeoman.dist %>/scripts/scripts.js': [
    //         '<%= yeoman.dist %>/scripts/scripts.js'
    //       ]
    //     }
    //   }
    // },
    // concat: {
    //   dist: {}
    // },

    ts: {
      // A specific target
      build: {
        // The source TypeScript files, http://gruntjs.com/configuring-tasks#files
        src: ['<%= yeoman.app %>/scripts/**/*.ts'],
		// If specified, generate this file that to can use for reference management
        reference: 'tsd.gen.d.ts',
        // If specified, the generate JavaScript files are placed here. Only works if out is not specified
        //outDir: 'test/outputdirectory',
        // If specified, watches this directory for changes, and re-runs the current target
        //watch: '<%= yeoman.app %>/scripts',
        // Use to override the default options, http://gruntjs.com/configuring-tasks#options
        options: {
          target: 'es5',
          module: 'commonjs', // 'amd' (default) | 'commonjs'
          sourceMap: true,
          declaration: false,
          removeComments: false
        }
      }
    },

    tsd: {
      refresh: {
        options: {
          // execute a command
          command: 'reinstall',

          //optional: always get from HEAD
          latest: true,

          // specify config file
          config: 'tsd.json',

          // experimental: options to pass to tsd.API
          opts: {
            // props from tsd.Options
          }
        }
      }
    },

    bgShell: {
      _defaults: {
        cmd: 'python main.py -config=env.vagrant_serve.conf',
        bg: true,
        stdout: function(data) {
          grunt.log.write("out: "+data.length+" "+data);
        },
        fail: true
      },
      pvd: {
        execOpts: {
          cwd: '/var/server',
          maxBuffer: false
        }
      },
      release: {
        cmd: 'python main.py -config=env.vagrant_release.conf',
        execOpts: {
          cwd: '/var/server',
          maxBuffer: false
        }
      }
    },

    license: {
      bowser_licenses: {
        options: {
           directory: '<%= yeoman.app %>/bower_components',
           output: '<%= yeoman.app %>/data/licenses.json'
        },
      },
    }
  });


  grunt.registerTask('serve_python', function (target) {
    if (target === 'dist') {
      return grunt.task.run(['buildd', 'connect:dist:keepalive']);
    } else  if(target === 'release') {
      return grunt.task.run([
        'release',
        'bgShell:release',
        'watch'
      ]);
    }

    grunt.task.run([
      'clean:server',
      'wiredep:indexhtml',
      //'concurrent:server',
      'autoprefixer',
      //'connect:livereload',
      'bgShell:pvd',
      'watch'
    ]);
  });

  grunt.registerTask('serve', function (target) {
    if (target === 'dist') {
      return grunt.task.run(['buildd', 'connect:dist:keepalive']);
    } else  if(target === 'release') {
      return grunt.task.run([
        'release',
        //'bgShell:release',
        'watch'
      ]);
    }

    grunt.task.run([
      'clean:server',
      'wiredep:indexhtml',
      //'concurrent:server',
      'autoprefixer',
      //'connect:livereload',
      //'bgShell:pvd',
      'watch'
    ]);
  });

  grunt.registerTask('server', function () {
    grunt.log.warn('The `server` task has been deprecated. Use `grunt serve` to start a server.');
    grunt.task.run(['serve']);
  });

  grunt.registerTask('build', [
    'clean:dist',
    'wiredep:indexhtml',
    'license:bowser_licenses',
    'tsd:refresh',
    'ts:build',
    'useminPrepare',
    'concurrent:dist',
    'copy:styles',
    'autoprefixer',
    'concat',
    'ngAnnotate:dist',
    'copy:dist',
    //'cdnify',
    'cssmin',
    'uglify',
    'rev',
    'usemin',
    'htmlmin'
  ]);

  grunt.registerTask('buildd', [
    'clean:dist',
    'wiredep:indexhtml',
    'license:bowser_licenses',
    'tsd:refresh',
    'ts:build',
    'concurrent:test',
    'copy:styles',
    'autoprefixer',
    'copy:distd'
  ]);

  grunt.registerTask('release', [
    'clean:release',
    'wiredep:indexhtml',
    'license:bowser_licenses',
    'tsd:refresh',
    'ts:build',
    'concurrent:test',
    'copy:styles',
    'autoprefixer',
    'copy:release'
  ]);

  grunt.registerTask('default', [
    'newer:jshint',
    'test',
    'build'
  ]);
};
