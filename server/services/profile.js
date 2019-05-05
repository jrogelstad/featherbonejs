/**
    Framework for building object relational database apps
    Copyright (C) 2019  John Rogelstad

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
/*jslint node*/
(function (exports) {
    "use strict";

    const f = require("../../common/core");
    const jsonpatch = require("fast-json-patch");
    const conflictErr = new Error(
        "Profile has been changed by another instance. " +
        "Changes will not save until the browser is refereshed."
    );
    conflictErr.statusCode = 409;

    exports.Profile = function () {
        // ..........................................................
        // PUBLIC
        //

        let that = {};

        /**
          Return user profile.

          @param {Object} Request payload
          @param {Object} [payload.client] Database client
          @param {Object} [payload.role] Role
          @return {Object} Promise
        */
        that.getProfile = function (obj) {
            return new Promise(function (resolve, reject) {
                let sql = "SELECT etag, data FROM \"$profiles\" WHERE role = $1;";
                let role = obj.client.currentUser;

                // Query profile
                obj.client.query(sql, [role], function (err, resp) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Send back result
                    if (resp.rows.length) {
                        resolve(resp.rows[0]);
                    } else {
                        resolve(false);
                    }
                });
            });
        };

        /**
          Save a user profile.

          @param {Object} Request payload
          @param {Object} [payload.client] Database client
          @param {String} [payload.client.currentUser] Current user
          @param {String} [payload.etag] Version for optimistic locking
          @param {Object} [payload.data] Profile data
          @return {Object} Promise
        */
        that.saveProfile = function (obj) {
            return new Promise(function (resolve, reject) {
                let sql = (
                    "SELECT etag FROM \"$profiles\" WHERE role = $1;"
                );
                let role = obj.client.currentUser;
                let etag = f.createId();

                // Query profile
                obj.client.query(sql, [role], function (err, resp) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Send back result
                    if (resp.rows.length) {
                        if (obj.etag !== resp.rows[0].etag) {
                            reject(conflictErr);
                            return;
                        }

                        sql = (
                            "UPDATE \"$profiles\" " +
                            "SET etag = $2, data = $3 WHERE role = $1;"
                        );
                    } else {
                        sql = "INSERT INTO \"$profiles\" VALUES ($1, $2, $3);";
                    }

                    obj.client.query(
                        sql,
                        [role, etag, obj.data]
                    ).then(resolve.bind(null, etag)).catch(reject);
                });
            });
        };

        /**
          Save a user profile.

          @param {Object} Request payload
          @param {Object} [payload.client] Database client
          @param {String} [payload.client.currentUser] Current user
          @param {String} [payload.etag] Version for optimistic locking
          @param {Object} [payload.data] Profile data
          @return {Object} Promise
        */
        that.patchProfile = function (obj) {
            return new Promise(function (resolve, reject) {
                let sql = "SELECT etag, data FROM \"$profiles\" WHERE role = $1;";
                let data;
                let role = obj.client.currentUser;
                let etag = f.createId();

                // Query profile
                obj.client.query(sql, [role], function (err, resp) {
                    if (err) {
                        reject(err);
                        return;
                    }

                    // Send back result
                    if (resp.rows.length) {
                        if (obj.data.etag !== resp.rows[0].etag) {
                            reject(conflictErr);
                            return;
                        }

                        sql = (
                            "UPDATE \"$profiles\" " +
                            "SET etag = $2, data = $3 WHERE role = $1;"
                        );
                        data = resp.rows[0].data;
                        jsonpatch.applyPatch(data, obj.data.patch);
                        obj.client.query(
                            sql,
                            [role, etag, data]
                        ).then(resolve.bind(null, etag)).catch(reject);
                    } else {
                        reject(
                            new Error("Profile does not exist for " + role)
                        );
                    }
                });
            });
        };

        return that;
    };

}(exports));
