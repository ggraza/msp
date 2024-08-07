// frappe.provide('frappe.ui.form');

// frappe.ui.form.CustomerQuickEntryForm = frappe.ui.form.QuickEntryForm.extend({
// 	init: function(doctype, after_insert, init_callback, doc, force) {
// 		this._super(doctype, after_insert, init_callback, doc, force);
// 		this.skip_redirect_on_error = true;
// 	},

// 	render_dialog: function() {
// 		this.mandatory = this.mandatory.concat(this.get_variant_fields());
// 		this._super();
// 		console.log("hi")
// 		let me = this
// 		console.log(me)
// 		me.dialog.fields_dict.customer_name.$input[0].onchange = function() {
// 			me.inputHandler(this)
// 		}

// 	},

// 	inputHandler: function(obj) {
// 		console.log("test")
// 		console.log(obj.value)
// 	},


    
// 	get_variant_fields: function() {
// 		var variant_fields = [{
// 			fieldtype: "Section Break",
// 			label: __("Primary Contact Details"),
// 			collapsible: 1
// 		},
// 		{
// 			label: __("Salutation"),
// 			fieldname: "contact_salutation",
// 			fieldtype: "Link",
// 			options: "Salutation"
// 		},
//         {
// 			label: __("First Name"),
// 			fieldname: "first_name",
// 			fieldtype: "Data"
// 		},
//         {
// 			label: __("Last Name"),
// 			fieldname: "last_name",
// 			fieldtype: "Data"
// 		},
// 		{
// 			fieldtype: "Column Break"
// 		},
// 		{
// 			label: __("Mobile Number"),
// 			fieldname: "mobile_no",
// 			fieldtype: "Data"
// 		},
//         {
// 			label: __("Phone Number"),
// 			fieldname: "phone",
// 			fieldtype: "Data"
// 		},
//         {
// 			label: __("Email Id"),
// 			fieldname: "email_id",
// 			fieldtype: "Data"
// 		},
// 		{
// 			fieldtype: "Section Break",
// 			label: __("Primary Address Details"),
// 			collapsible: 1
// 		},
// 		{
// 			label: __("Address Line 1"),
// 			fieldname: "address_line1",
// 			fieldtype: "Data"
// 		},
// 		{
// 			label: __("Address Line 2"),
// 			fieldname: "address_line2",
// 			fieldtype: "Data"
// 		},
// 		{
// 			label: __("ZIP Code"),
// 			fieldname: "pincode",
// 			fieldtype: "Data"
// 		},
// 		{
// 			fieldtype: "Column Break"
// 		},
// 		{
// 			label: __("City"),
// 			fieldname: "city",
// 			fieldtype: "Data"
// 		},
// 		{
// 			label: __("State"),
// 			fieldname: "state",
// 			fieldtype: "Data",
//             hidden: 1
// 		},
// 		{
// 			label: __("Country"),
// 			fieldname: "country",
// 			fieldtype: "Link",
// 			options: "Country",
//             default: "Germany"
// 		},
// 		{
// 			label: __("Customer POS Id"),
// 			fieldname: "customer_pos_id",
// 			fieldtype: "Data",
// 			hidden: 1
// 		}];

// 		return variant_fields;
// 	},
// })
frappe.provide('frappe.ui.form');

frappe.ui.form.CustomerQuickEntryForm = class CustomerQuickEntryForm extends frappe.ui.form.QuickEntryForm {
    constructor(doctype, after_insert, init_callback, doc, force) {
        super(doctype, after_insert, init_callback, doc, force);
        this.skip_redirect_on_error = true;
    }

    render_dialog() {
        this.mandatory = this.mandatory.concat(this.get_variant_fields());
        super.render_dialog();
        console.log("hi");
        let me = this;
        console.log(me);
        
        if (me.dialog.fields_dict && me.dialog.fields_dict.customer_name) {
            me.dialog.fields_dict.customer_name.$input[0].onchange = function() {
                me.inputHandler(this);
            };
        } else {
            console.error("Customer name field not found or undefined in fields_dict.");
        }
    }

    inputHandler(obj) {
        console.log("test");
        console.log(obj.value);
    }

    get_variant_fields() {
        return [
            {
                fieldtype: "Section Break",
                label: __("Primary Contact Details"),
                collapsible: 1
            },
            {
                label: __("Salutation"),
                fieldname: "contact_salutation",
                fieldtype: "Link",
                options: "Salutation"
            },
            {
                label: __("First Name"),
                fieldname: "first_name",
                fieldtype: "Data"
            },
            {
                label: __("Last Name"),
                fieldname: "last_name",
                fieldtype: "Data"
            },
            {
                fieldtype: "Column Break"
            },
            {
                label: __("Mobile Number"),
                fieldname: "mobile_no",
                fieldtype: "Data"
            },
            {
                label: __("Phone Number"),
                fieldname: "phone",
                fieldtype: "Data"
            },
            {
                label: __("Email Id"),
                fieldname: "email_id",
                fieldtype: "Data"
            },
            {
                fieldtype: "Section Break",
                label: __("Primary Address Details"),
                collapsible: 1
            },
            {
                label: __("Address Line 1"),
                fieldname: "address_line1",
                fieldtype: "Data"
            },
            {
                label: __("Address Line 2"),
                fieldname: "address_line2",
                fieldtype: "Data"
            },
            {
                label: __("ZIP Code"),
                fieldname: "pincode",
                fieldtype: "Data"
            },
            {
                fieldtype: "Column Break"
            },
            {
                label: __("City"),
                fieldname: "city",
                fieldtype: "Data"
            },
            {
                label: __("State"),
                fieldname: "state",
                fieldtype: "Data",
                hidden: 1
            },
            {
                label: __("Country"),
                fieldname: "country",
                fieldtype: "Link",
                options: "Country",
                default: "Germany"
            },
            {
                label: __("Customer POS Id"),
                fieldname: "customer_pos_id",
                fieldtype: "Data",
                hidden: 1
            }
        ];
    }
};

