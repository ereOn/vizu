'use strict';

var Git = require('git-exec');
var npath = require('path');

function Commit(objectname, attrs) {
  this.objectname = objectname;
  this.head = false;
  this.index = null;
  this.children = [];
  this.depth = 0;
  this.order = 0;
  this.refnames = [];
  this.parents = [];
  this.msg = null;

  for (var attr in attrs) {
    this[attr] = attrs[attr];
  }
}

function Repository(filepath) {
  var self = this;
  this.path = filepath;
  this.git_path = npath.join(filepath, '.git');
  this.repo = new Git(this.path);

  this.fetchRefnames = function() {
    return new Promise(function(resolve, reject) {
      self.repo.exec('for-each-ref', ['--format="%(objectname) %(refname:short) %(objecttype) %(HEAD)"', 'refs/heads'], function(stderr, stdout) {
        var refnames = {};
        var head = null;
        var lines = stdout.split('\n');

        for (var i = 0; i < lines.length; ++i) {
          var items = lines[i].split(' ');
          var objectname = items[0];
          var refname = items[1];
          var objecttype = items[2];
          var is_head = items[3];

          if (objecttype == 'commit') {
            if (objectname in refnames) {
              refnames[objectname].push(refname);
            } else {
              refnames[objectname] = [refname];
            }

            if (is_head) {
              head = objectname;
            }
          }
        }

        resolve({
          refnames: refnames,
          head: head
        });
      });
    });
  };

  this.fetchCommits = function() {
    return new Promise(function(resolve, reject) {
      self.repo.exec('rev-list', ['--all', '--reverse', '--parents', '--format=%s'], function(stderr, stdout) {
        var commits = {};
        var max_depth = 0;
        var max_order = 0;
        var letter_index = 65;
        var max_letter_index = 65 + 26;
        var depth_counts = {};
        var lines = stdout.split('\n');

        for (var i = 0; i < lines.length; ++i) {
          var items = lines[i].split(' ');
          var objecttype = items.splice(0, 1)[0];

          if (objecttype == 'commit') {
            var objectname = items.splice(0, 1)[0];
            var msg = lines[++i];
            var parents = items;
            var depth = Math.max.apply(Math, parents.map(function(parent_) {
              return commits[parent_].depth + 1;
            }).concat(0));

            if (depth > max_depth) {
              max_depth = depth;
            }

            if (depth in depth_counts) {
              var order = depth_counts[depth];
              depth_counts[depth]++;
            } else {
              var order = 0;
              depth_counts[depth] = 1;
            }

            if (order > max_order) {
              max_order = order;
            }

            var attrs = {
              parents: parents,
              depth: depth,
              order: order,
              letter: letter_index <= max_letter_index ? String.fromCharCode(letter_index++) : '',
              msg: msg
            };

            commits[objectname] = new Commit(objectname, attrs);

            for (var j = 0; j < parents.length; ++j) {
              commits[parents[j]].children.push(objectname);
            }
          }
        }

        self.fetchRefnames().then(function(results) {
          for (var objectname in results.refnames) {
            if (objectname in commits) {
              var commit = commits[objectname];
              commit.refnames = results.refnames[objectname];

              if (objectname == results.head) {
                commit.head = true;
              }
            }
          }

          resolve({
            commits: commits,
            max_depth: max_depth,
            max_order: max_order
          });
        });
      });
    });
  };
}

exports.load_repository = function(path) {
  return new Repository(path);
}
