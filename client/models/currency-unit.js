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
import { catalog } from "./catalog.js";
import { model } from "./model.js";
import { list } from "./list.js";

/*
  Currency Unit model
*/
function currencyUnit(data, feather) {
    feather = feather || catalog.getFeather("CurrencyUnit");
    let that = model(data, feather);

    that.onValidate(function () {
        if (that.data.code().length > 4) {
            throw "code may not be more than 4 characters";
        }
    });

    return that;
}

currencyUnit.list = list("CurrencyUnit");

catalog.register("models", "currencyUnit", currencyUnit);
export { currencyUnit };
