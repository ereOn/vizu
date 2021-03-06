'use strict';

var Git = require('git-exec');
var npath = require('path');

function Commit(objectname, attrs) {
  this.objectname = objectname;
  this.head = false;
  this.current = false;
  this.children = [];
  this.depth = 0;
  this.order = null;
  this.refnames = [];
  this.parent_refs = [];
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
      self.repo.exec('for-each-ref', ['--format="%(objectname) %(refname:short) %(objecttype)"', 'refs/heads'], function(stderr, stdout) {
        var refnames = {};
        var lines = stdout.split('\n');

        for (var i = 0; i < lines.length; ++i) {
          var items = lines[i].split(' ');
          var objectname = items[0];
          var refname = items[1];
          var objecttype = items[2];

          if (objecttype == 'commit') {
            if (objectname in refnames) {
              refnames[objectname].push(refname);
            } else {
              refnames[objectname] = [refname];
            }
          }
        }

        resolve(refnames);
      });
    });
  };

  this.fetchHead = function() {
    return new Promise(function(resolve, reject) {
      self.repo.exec('rev-parse', ['HEAD'], function(stderr, stdout) {
        var lines = stdout.split('\n');
        var head = lines[0];

        resolve(head);
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
        var lines = stdout.split('\n');
        var roots = [];

        for (var i = 0; i < lines.length; ++i) {
          var items = lines[i].split(' ');
          var objecttype = items.splice(0, 1)[0];

          if (objecttype == 'commit') {
            var objectname = items.splice(0, 1)[0];
            var msg = lines[++i];
            var parent_refs = items;

            var attrs = {
              parent_refs: parent_refs,
              letter: letter_index < max_letter_index ? String.fromCharCode(letter_index++) : '',
              msg: msg
            };

            var commit = commits[objectname] = new Commit(objectname, attrs);

            if (parent_refs.length == 0) {
              roots.push(commit);
            }
          }
        }

        for (var objectname in commits) {
          var commit = commits[objectname];

          for (var i = 0; i < commit.parent_refs.length; ++i) {
            var parent_ = commits[commit.parent_refs[i]];

            if (parent_) {
              commit.parents.push(parent_);
            } else {
              console.log("Commit ", objectname, " refers to a parent commit ", commit.parent_refs[i], " which was not found !");
            }
          }

          commit.depth = Math.max.apply(Math, commit.parents.map(function(c) {
            return c.depth + 1;
          }).concat(0));

          if (commit.depth > max_depth) {
            max_depth = commit.depth;
          }

          for (var i = 0; i < commit.parents.length; ++i) {
            commit.parents[i].children.push(commit);
          }
        }

        var orders = {};
        var set_orders = function(commit) {
          if (commit.order == null) {
            if (commit.depth in orders) {
              commit.order = ++orders[commit.depth];
            } else {
              commit.order = orders[commit.depth] = 0;
            }

            if (commit.order > max_order) {
              max_order = commit.order;
            }

            commit.children.forEach(set_orders);
          }
        }

        roots.forEach(set_orders);

        Promise.all([
          self.fetchRefnames(),
          self.fetchHead()
        ]).then(function(results) {
          var refnames = results[0];
          var head = results[1];

          for (var objectname in refnames) {
            if (objectname in commits) {
              var commit = commits[objectname];
              commit.refnames = refnames[objectname];
            }
          }

          if (head in commits) {
            var commit = commits[head];
            commit.head = true;

            var set_current = function(commit) {
              commit.current = true;
              commit.parents.forEach(set_current);
            }
            set_current(commit);
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
