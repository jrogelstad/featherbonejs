/**
    Framework for building object relational database apps
    Copyright (C) 2018  John Rogelstad

    This program is free software: you can redistribute it and/or modify
    it under the terms of the GNU Affero General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    This program is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU Affero General Public License for more details.

    You should have received a copy of the GNU Affero General Public License
    along with this program.  If not, see <http://www.gnu.org/licenses/>.
**/

/*global window*/
(function () {
  "use strict";

  var scrWidth, inner, widthNoScroll, widthWithScroll,
    tableWidget = {},
    m = require("mithril"),
    stream = require("stream"),
    f = require("component-core"),
    statechart = require("statechartjs"),
    catalog = require("catalog"),
    outer = document.createElement("div"),
    COL_WIDTH_DEFAULT = "150px",
    LIMIT = 20,
    ROW_COUNT = 2;

  // Calculate scroll bar width
  // http://stackoverflow.com/questions/13382516/getting-scroll-bar-width-using-javascript
  outer.style.visibility = "hidden";
  outer.style.width = "100px";
  outer.style.msOverflowStyle = "scrollbar"; // needed for WinJS apps

  document.body.appendChild(outer);

  widthNoScroll = outer.offsetWidth;
  // force scrollbars
  outer.style.overflow = "scroll";

  // add innerdiv
  inner = document.createElement("div");
  inner.style.width = "100%";
  outer.appendChild(inner);        

  widthWithScroll = inner.offsetWidth;

  // remove divs
  outer.parentNode.removeChild(outer);
  scrWidth = widthNoScroll - widthWithScroll;

  // Define workbook view model
  tableWidget.viewModel = function (options) {
    options = options || {};
    var fromWidthIdx, dataTransfer,
      selectionChanged, selectionFetched, fetch,
      feather = catalog.getFeather(options.feather),
      modelName = options.feather.toCamelCase(),
      offset = 0,
      vm = {};

    // ..........................................................
    // PUBLIC
    //

    vm.attrs = function () {
      var columns = vm.config().columns,
        result = columns.map(function(column) {
          return column.attr;
        });
      return result || [{attr: "id"}];
    };
    vm.isEditModeEnabled = stream(options.isEditModeEnabled !== false);
    vm.config = stream(options.config);
    vm.containerId = stream(options.containerId);
    vm.defaultFocus = function (model) {
      var col = vm.attrs().find(function (attr) {
        return !model.data[attr] || !model.data[attr].isReadOnly();
      });
      return col ? col.toCamelCase(true) : undefined;
    };
    vm.feather = stream(feather);
    vm.filter = f.prop();
    vm.goNextRow = function () {
      var list = vm.models(),
        model = vm.model(),
        idx = list.indexOf(model) + 1;
      if (list.length > idx) {
        vm.select(list[idx]);
      }
    };
    vm.goPrevRow = function () {
      var list = vm.models(),
        model = vm.model(),
        idx = list.indexOf(model) - 1;
      if (idx >= 0) {
        vm.select(list[idx]);
      }
    };
    vm.ids = stream({
      header: f.createId(),
      rows: f.createId()
    });
    vm.isSelected = function (model) {
      var prop,
        selection = vm.selection();
      if (selection && model) {
        prop = selection.idProperty();
        return selection.data[prop]() === model.data[prop]();
      }
      return false;
    };
    vm.mode = function () {
      var state = vm.state();
      return state.resolve(state.current()[0]);
    };
    vm.model = function () {
      return vm.selection();
    };
    vm.modelDelete = function () {
      return vm.mode().modelDelete();
    };
    vm.modelNew = function () {
      return vm.mode().modelNew();
    };
    vm.models = stream(options.models);
    vm.nextFocus = stream();
    vm.ondblclick = function (model) {
      vm.select(model);
      if (options.ondblclick) {
        options.ondblclick();
      }
    };
    vm.ondragover = function (toIdx, ev) {
      if (!isNaN(toIdx)) {
        if (fromWidthIdx > toIdx) { return; }
      } else { ev = toIdx; }
      ev.preventDefault();
    };
    vm.ondragstart = function (idx, type, ev) {
      dataTransfer = {}; // Because ms edge only allows one value
      dataTransfer.typeStart = type;

      switch (type)
      {
      case "width":
        fromWidthIdx = idx;
        dataTransfer.widthStart = ev.clientX;
        return;
      }

      dataTransfer[type] = idx;
    };
    vm.ondrop = function (toIdx, type, ary, ev) {
      var moved, column, fromIdx, oldWidth, newWidth, widthStart,
        typeStart = dataTransfer.typeStart;

      ev.preventDefault();

      switch (typeStart)
      {
      case "width":
        if (fromWidthIdx <= toIdx) {
          widthStart = dataTransfer.widthStart - 0;
          column = vm.config().columns[fromWidthIdx];
          oldWidth = column.width || COL_WIDTH_DEFAULT;
          oldWidth = oldWidth.replace("px", "") - 0;
          newWidth = oldWidth - (widthStart - ev.clientX);
          column.width = newWidth + "px";
        }
        break;
      default:
        fromIdx = dataTransfer[type] - 0;
        if (fromIdx !== toIdx) {
          moved = ary.splice(fromIdx, 1)[0];
          ary.splice(toIdx, 0, moved);
        }
      }
    };
    vm.onkeydownCell = function (e) {
      var id, step,
        key = e.key || e.keyIdentifier,
        nav = function (name) {
          id = e.srcElement.id;
          // Counter potential data changes made by this keystroke
          if (typeof e.srcElement[step] === "function") {
            try {
              e.srcElement[step]();
            } catch (ignore) {}
          }
          // Navigate in desired direction
          //m.startComputation();
          vm[name]();
          //m.endComputation();
          // Set focus on the same cell we left
          //m.startComputation();
          document.getElementById(id).focus();
          //m.endComputation();
        };

      switch (key)
      {
      case "Up":
        step = "stepDown";
        nav("goPrevRow");
        break;
      case "Down":
        step = "stepUp";
        nav("goNextRow");
        break;
      }
    };
    vm.onscroll = function (evt) {
      var ids = vm.ids(),
        e = evt.srcElement,
        remainScroll = e.scrollHeight - e.clientHeight - e.scrollTop,
        childHeight = e.lastChild.clientHeight,
        header = document.getElementById(ids.header),
        rows = document.getElementById(ids.rows);

      // Lazy load: fetch more rows if near bottom and more possible
      if (remainScroll < childHeight * ROW_COUNT
          && vm.models().length >= offset) {
        offset = offset + LIMIT;
        fetch();
      }
      // Sync header position with table body position
      header.scrollLeft = rows.scrollLeft;
    };
    vm.refresh = function () {
      fetch(true);
    };
    vm.relations = stream({});
    vm.save = function () {
      vm.models().save();
    };
    vm.scrollbarWidth = stream(scrWidth);
    vm.search = options.search || stream("");
    vm.select = function (model) {
      var idx, state,
        selection = vm.selection();
      if (selection !== model) {
        // Remove old state binding
        if (selection) {
          state = selection.state().resolve("/Ready/Fetched/Dirty");
          idx = state.enters.indexOf(selectionChanged);
          state.enters.splice(idx, 1);
          state = selection.state().resolve("/Delete");
          idx = state.enters.indexOf(selectionChanged);
          state.enters.splice(idx, 1);
          state = selection.state().resolve("/Ready/Fetched/Clean");
          idx = state.enters.indexOf(selectionFetched);
          state.enters.splice(idx, 1);
        }
        vm.relations({});
        vm.selection(model);
        // Add new state binding
        if (model) {
          state = model.state().resolve("/Ready/Fetched/Dirty");
          state.enter(selectionChanged);
          state = model.state().resolve("/Delete");
          state.enter(selectionChanged);
          state = model.state().resolve("/Ready/Fetched/Clean");
          state.enter(selectionFetched);
        }
      }

      if (vm.selection()) {
        vm.state().send("selected");
      } else {
        vm.state().send("unselected");
      }

      return vm.selection();
    };
    vm.selection = stream();
    vm.selectedColor = function () {
      return vm.mode().selectedColor();
    };
    vm.state = stream();
    vm.toggleEdit = function () {
      vm.state().send("edit");
    };
    vm.toggleView = function () {
      vm.state().send("view");
    };
    vm.toggleSelection = function (model, col) {
      return vm.mode().toggleSelection(model, col);
    };
    vm.undo = function () {
      var selection = vm.selection();
      if (selection) { selection.undo(); }
    };
    vm.zoom = stream(100);

    // ..........................................................
    // PRIVATE
    //

    vm.filter(f.copy(options.config.filter || {}));
    vm.filter().limit = vm.filter().limit || LIMIT;
    if (!options.models) {
      vm.models = catalog.store().models()[modelName].list({
        filter: vm.filter()
      });
    }

    fetch = function (refresh) {
      var fattrs, formatOf, criterion,
        value = vm.search(),
        filter= f.copy(vm.filter());

      if (refresh) { offset = 0; }

      filter.offset = offset;

      // Recursively resolve type
      formatOf = function (feather, property) {
        var prefix, suffix, rel, prop,
          idx = property.indexOf(".");

        if (idx > -1) {
          prefix = property.slice(0, idx);
          suffix = property.slice(idx + 1, property.length);
          rel = feather.properties[prefix].type.relation;
          return formatOf(catalog.getFeather(rel), suffix);
        }

        prop = feather.properties[property];
        return prop.format || prop.type;
      };

      // Only search on text attributes
      if (value) {
        fattrs = vm.attrs().filter(function (attr) {
          return formatOf(vm.feather(), attr) === "string";
        });

        if (fattrs.length) {
          criterion = {
            property: fattrs,
            operator: "~*",
            value: value
          };
          filter.criteria = filter.criteria || [];
          filter.criteria.push(criterion);
        }
      }

      vm.models().fetch(filter, refresh !== true);
    };

    selectionChanged = function () {
      vm.state().send("changed");
    };

    selectionFetched = function () {
      vm.state().send("fetched");
    };

    // Bind refresh to filter change event
    vm.filter.state().resolve("/Ready").enter(function () {
      vm.config().filter = vm.filter();
      vm.refresh();
    });

    // Create table widget statechart
    vm.state(statechart.define({concurrent: true}, function () {
      this.state("Mode", function () {
        this.state("View", function () {
          this.event("edit", function () {
            if (vm.isEditModeEnabled()) {
              this.goto("../Edit");
            }
          });
          this.modelDelete = function () {
            var selection = vm.selection();
            selection.delete(true).then(function () {
              vm.select();
              vm.models().remove(selection);
            });
          };
          this.modelNew = stream(false); // Do nothing
          this.selectedColor = function () {
            return "LightSkyBlue";
          };
          this.toggleSelection = function (model, col) {
            if (vm.selection() === model) {
              vm.select(undefined);
              return false;
            }

            vm.select(model);
            vm.nextFocus("input" + col.toCamelCase(true));
            return true;
          };
        });
        this.state("Edit", function () {
          this.event("view", function () {
            this.goto("../View");
          });
          this.modelDelete = function () {
            var selection = vm.selection(),
              prevState = selection.state().current()[0];
            selection.delete();
            if (prevState === "/Ready/New") {
              vm.models().remove(selection);
            }
          };
          this.modelNew = function () {
            var  name = vm.feather().name.toCamelCase(),
              model = catalog.store().models()[name](),
              input = "input" + vm.defaultFocus(model).toCamelCase(true);
            vm.models().add(model);
            vm.nextFocus(input);
            vm.select(model);
            return true;
          };
          this.selectedColor = function () {
            return "Azure";
          };
          this.toggleSelection = function (model, col) {
            vm.select(model);
            vm.nextFocus("input" + col.toCamelCase(true));
            return true;
          };
        });
      });
      this.state("Selection", function () {
        this.event("selected", function () {
          this.goto("./On", {force: true});
        });
        this.state("Off");
        this.state("On", function () {
          this.event("unselected", function () {
            this.goto("../Off");
          });
          this.C(function() {
            if (vm.selection().canUndo()) { 
              return "./Dirty";
            }
            return "./Clean";
          });
          this.state("Clean", function () {
            this.event("changed", function () {
              this.goto("../Dirty");
            });
          });
          this.state("Dirty", function () {
            this.event("fetched", function () {
              this.goto("../Clean");
            });
          });
        });
      });
    }));

    // Initialize statechart
    vm.state().goto();

    return vm;
  };

  // Define table widget component
  tableWidget.component = {

    view: function (vnode) {
      var tbodyConfig, findFilterIndex,
        header, rows, view, rel,
        vm = vnode.attrs.viewModel,
        ids = vm.ids(),
        config = vm.config(),
        filter = vm.filter(),
        sort = filter.sort || [],
        idx = 0,
        zoom = vm.zoom() + "%";

      findFilterIndex = function (col, name) {
        name = name || "criteria";
        var hasCol,
          ary = filter[name] || [],
          i = 0;

        hasCol = function (item) {
          if (item.property === col) { return true; }
          i +=1;
        };

        if (ary.some(hasCol)) { return i; }
        return false;
      };

      // Determine appropriate height based on surroundings
      tbodyConfig = function (vnode) {
        var e = document.getElementById(vnode.dom.id),
          yPosition = f.getElementPosition(e).y,
          winHeight = window.innerHeight,
          id = vm.containerId(),
          container = id ? document.getElementById(id) : document.body,
          containerHeight = container.offsetHeight + f.getElementPosition(container).y,
          bottomHeight = containerHeight - yPosition - e.offsetHeight;

        e.style.height = winHeight - yPosition - bottomHeight + "px";

        // Key down handler for up down movement
        e.addEventListener("keydown", vm.onkeydownCell);
      };

      // Build header
      idx = 0;
      header = (function () {
        var ths = config.columns.map(function (col) {
            var hview, order, name,
              key = col.attr,
              icon = [],
              fidx = findFilterIndex(key, "sort"),
              operators = f.operators,
              columnWidth = config.columns[idx].width || COL_WIDTH_DEFAULT;

            columnWidth = (columnWidth.replace("px", "") - 6) + "px"; 

            // Add sort icons
            if (fidx !== false) {
              order = sort[fidx].order || "ASC";
              if (order.toUpperCase() === "ASC") {
                name = "fa fa-sort-asc";
              } else {
                name= "fa fa-sort-desc";
              }

              icon.push(m("i", {
                class: name + " suite-column-sort-icon", 
                style: {fontSize: zoom}
              }));

              if (sort.length > 1) {
                icon.push(m("span", {
                  class: "suite-column-sort-number",
                  style: {fontSize: vm.zoom() * 0.6 + "%"}
                }, fidx + 1));
              }
            }

            // Add filter icons
            fidx = findFilterIndex(key);
            if (fidx !== false) {
              icon.push(m("i", {
                class: "fa fa-filter suite-column-filter-icon", 
                title: operators[(filter.criteria[fidx].operator || "=")] +
                  " " + filter.criteria[fidx].value,
                style: {fontSize: vm.zoom() * 0.80 + "%"}
              }));
            }

            hview = [
              m("th", {
                ondragover: vm.ondragover.bind(this, idx),
                draggable: true,
                ondragstart: vm.ondragstart.bind(this, idx, "column"),
                ondrop: vm.ondrop.bind(this, idx, "column", config.columns),
                class: "suite-column-header",
                style: {
                  minWidth: columnWidth,
                  maxWidth: columnWidth,
                  fontSize: zoom
                }
              }, icon, col.label || key.toName()),
              m("th", {
                ondragover: vm.ondragover.bind(this, idx),
                draggable: true,
                ondragstart: vm.ondragstart.bind(this, idx, "width"),
                class: "suite-column-header-grabber"
              })
            ];

            idx += 1;

            return hview;
          });

        // Front cap header navigation
        ths.unshift(m("th", {style: {minWidth: "16px"}}));

        // End cap on header for scrollbar
        ths.push(m("th", {
          style: {
            minWidth: vm.scrollbarWidth() + "px",
            maxWidth: vm.scrollbarWidth() + "px"
          }
        }));

        return m("tr", ths);
      }());

      // Build rows
      idx = 0;
      rows = vm.models().map(function (model) {
        var tds, row, thContent, onclick,
          currentMode = vm.mode().current()[0],
          color = "White",
          isSelected = vm.isSelected(model),
          currentState = model.state().current()[0],
          d = model.data,
          rowOpts = {},
          cellOpts = {};

        // Build row
        if (isSelected) {
          color = vm.selectedColor();
        }

        // Build view row
        if (currentMode === "/Mode/View" || !isSelected) {
          // Build cells
          idx = 0;
          tds = vm.attrs().map(function (col) {
            var cell, content,
              prop = f.resolveProperty(model, col),
              value = prop(),
              format = prop.format || prop.type,
              columnWidth = config.columns[idx].width || COL_WIDTH_DEFAULT,
              tdOpts = {
                onclick: vm.toggleSelection.bind(this, model, col),
                class: "suite-cell-view",
                style: {
                  minWidth: columnWidth,
                  maxWidth: columnWidth,
                  fontSize: zoom
                }
              };

            // Build cell
            switch (format)
            {
            case "number":
            case "integer":
              content = value.toLocaleString();
              break;
            case "boolean":
              if (value) {
                content = m("i", {
                  onclick: onclick,
                  class: "fa fa-check"
                });
              }
              break;
            case "date":
              if (value) {
                // Turn into date adjusting time for current timezone
                value = new Date(value + f.now().slice(10));
                content = value.toLocaleDateString();
              }
              break;
            case "dateTime":
              value = value ? new Date(value) : "";
              content = value ? value.toLocaleString() : "";
              break;
            case "string":
              content = value;
              break;
            default:
              if (typeof format === "object" && d[col]()) {
                // If relation, use relation widget to find display property
                rel = catalog.store().components()[format.relation.toCamelCase() + "Relation"];
                if (rel) { value = d[col]().data[rel.valueProperty()](); }
              }
              content = value;
            }

            cell = m("td", tdOpts, content);
            idx += 1;

            return cell;
          });

          rowOpts = {
            ondblclick: vm.ondblclick.bind(this, model)
          };

        // Build editable row
        } else {
          cellOpts = {
            style: {
              borderColor: "blue",
              borderWidth: "thin",
              borderStyle: "solid"
            }
          };

          // Build cells
          idx = 0;
          tds = vm.attrs().map(function (col) {
            var cell, tdOpts, inputOpts,
              prop = f.resolveProperty(model, col),
              id = "input" + col.toCamelCase(true),
              columnWidth = config.columns[idx].width || COL_WIDTH_DEFAULT,
              dataList = config.columns[idx].dataList;

            inputOpts = {
              id: id,
              onclick: vm.toggleSelection.bind(this, model, col),
              value: prop(),
              oncreate: function (vnode) {
                var e = document.getElementById(vnode.dom.id);
                if (vm.nextFocus() === id) {
                  e.focus();
                  vm.nextFocus(undefined);
                }
              },
              style: {
                minWidth: columnWidth,
                maxWidth: columnWidth,
                boxShadow: "none",
                border: "none",
                padding: "0px",
                backgroundColor: color,
                fontSize: zoom
              },
              isCell: true
            };

            if (prop.isRequired && prop.isRequired() && 
              (prop() === null || prop() === undefined)) {
              tdOpts = {
                style: {
                  borderColor: "red",
                  borderWidth: "thin",
                  borderStyle: "ridge"
                }
              };
            } else {
              tdOpts = {
                style: {
                  borderColor: "blue",
                  borderWidth: "thin",
                  borderStyle: "solid"
                }
              };
            }

            tdOpts.style.minWidth = columnWidth;
            tdOpts.style.maxWidth = columnWidth;
            tdOpts.style.fontSize = zoom;

            if (dataList) {
              dataList = f.resolveProperty(model, dataList)();
            }

            cell = m("td", tdOpts, [
              f.buildInputComponent({
                model: model,
                key: col,
                dataList: dataList,
                viewModel: vm,
                options: inputOpts
              })
            ]);

            idx += 1;

            return cell;
          });
        }

        // Front cap header navigation
        onclick = vm.toggleSelection.bind(this, model, vm.defaultFocus(model));
        if (currentState === "/Delete") {
          thContent = m("i", {
            onclick: onclick,
            class:"fa fa-remove"
          });
        } else if (currentState === "/Ready/New") {
          thContent = m("i", {
            onclick: onclick,
            class:"fa fa-asterisk"
          });
        } else if (model.canUndo()) {
          thContent = m("i", {
            onclick: onclick,
            class:"fa fa-check"
          });
        } else {
          cellOpts = {
            onclick: onclick,
            style: {minWidth: "16px"}
          };
          if (currentMode === "/Mode/Edit" && isSelected) {
            cellOpts.style.borderColor = "blue";
            cellOpts.style.borderWidth = "thin";
            cellOpts.style.borderStyle = "solid";
            cellOpts.style.borderLeftStyle = "none";
          }
        }
        tds.unshift(m("th", cellOpts, thContent));

        // Build row
        rowOpts.style = { backgroundColor: color };
        rowOpts.key = model.id();
        row = m("tr", rowOpts, tds);

        idx += 1;

        return row;
      });

      view = m("table", {
          class: "pure-table suite-table"
        }, [
          m("thead", {
          id: ids.header,
          class: "suite-table-header"
        }, [header]),
        m("tbody", {
          id: ids.rows,
          class: "suite-table-body",
          onscroll: vm.onscroll,
          oncreate: tbodyConfig
        }, rows)
      ]);

      return view;
    }
  };

  catalog.register("components", "tableWidget", tableWidget.component);
  module.exports = tableWidget;

}());
