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

(function (exports) {
  'strict';

  exports.execute = function (obj) {
    return new Promise (function (resolve, reject) {
      var afterCurrentUser, getEveryone,
        createEveryone, grantEveryoneGlobal, user,
        datasource = require("../server/datasource");

      afterCurrentUser = function (err, resp) {
        if (err) {
          reject(err);
          return;
        }

        user = resp.rows[0].current_user;
        getEveryone();
      };

      // Create Everyone role
      getEveryone = function (err) {
        if (err) {
          reject(err);
          return;
        }

        datasource.request({
          name: "Role",
          method: "GET",
          user: user,
          id: "everyone",
          client: obj.client
        }, true)
          .then(createEveryone)
          .catch(reject);
      };

      createEveryone = function (resp) {
        if (!resp) {
          datasource.request({
            name: "Role",
            method: "POST",
            user: user,
            data: {
              id: "everyone",
              name: "Everyone",
              description: "All users",
              members: [
                {member: user}
              ]
            },
            client: obj.client
          }, true)
            .then(grantEveryoneGlobal)
            .catch(reject);
          return;
        }

        // Done
        resolve(true);
      };

      grantEveryoneGlobal = function () {
        var req, reqRole, reqLog, reqForm, reqWidget, reqTable,
          promises = [];

        req = function () {
          return {
            method: "PUT",
            name: "saveAuthorization",
            user: user,
            data: {
              id: "role",
              role: "everyone",
              actions: {
                canCreate: true,
                canRead: true,
                canUpdate: true,
                canDelete: true
              }
            },
            client: obj.client
          };
        };

        /* Grant everyone access to system objects */
        reqRole = req();
        promises.push(datasource.request(reqRole));
        reqLog = req();
        reqLog.data.id = "log";
        promises.push(datasource.request(reqLog));
        reqForm = req();
        reqForm.data.id = "form";
        promises.push(datasource.request(reqForm));
        reqTable = req();
        reqTable.data.id = "table_spec";
        promises.push(datasource.request(reqTable));
        reqWidget = req();
        reqWidget.data.id = "relation_widget";
        promises.push(datasource.request(reqWidget));

        Promise.all(promises)
          .then(resolve)
          .catch(reject);
      };

      /* Start */
      obj.client.query("SELECT CURRENT_USER", afterCurrentUser);
    });
  };
}(exports));