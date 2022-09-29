# Copyright (c) 2022, itsdave GmbH and contributors
# For license information, please see license.txt

# import frappe
from frappe.model.document import Document
from doctest import debug
import frappe
from frappe.model.document import Document
from erpnext.accounts.party import set_taxes as party_st
from erpnext.stock.doctype.delivery_note.delivery_note import make_sales_invoice
from msp.billing_tools import get_item_group_assignment_table
from datetime import datetime
from frappe import ValidationError, _

class AutoInvoiceGenerator(Document):

	@frappe.whitelist()
	def close_invoiced_delivery_notes(self):
		dns = frappe.get_all("Delivery Note", filters={"status": "To Bill"})
		print(len(dns))
		dns_to_close = []

		for el in dns:
			try:
				make_sales_invoice(el["name"])
			except ValidationError as e:
				if str(e) == _("All these items have already been Invoiced/Returned"):
					print(_("All these items have already been Invoiced/Returned") + " in: " +  el["name"])
					dns_to_close.append(el["name"])
		count = 0
		print(dns_to_close)
		for pos in dns_to_close:
			count +=1
			frappe.db.set_value("Delivery Note", pos, "status", "Closed")
		frappe.msgprint( str(count)+ " delivery notes were closed")

	
	@frappe.whitelist()
	def get_delivery_notes_for_invoicing(self): 

	#Funktion soll eine Liste aller Lieferscheine zurückgeben die abzurechnen sind 
		filters = {"status" : "to bill","is_return": 0, "project": "", "blocked_for_billing": 0 }
		#filters = {"status" : "to bill","is_return": 0, "project": ""}
		delivery_notes_list = frappe.get_all("Delivery Note", filters = filters, fields = ["name", "customer", "project"]) 
		print(len(delivery_notes_list))
		#dl = [x.name for x in delivery_notes_list if x.project]
		#print(dl)		
		#print(len(dl))
		return delivery_notes_list 
	@frappe.whitelist()
	def get_customer_for_invoicing(self, delivery_note): 

	#Funktion erstellt eine Liste von Kunden für die Rechnungen erstellt werden sollen 

		delivery_notes = self.get_delivery_notes_for_invoicing() 

		customer_list = [x.customer for x in delivery_notes] 

		customer_list_exc_duplicate = list(set(customer_list)) 
		#print(customer_list_exc_duplicate)

		return customer_list_exc_duplicate 

	def get_customer_asap_billing_mode(self):
		del_not = self.get_delivery_notes_for_invoicing()
		cust_list = self.get_customer_for_invoicing(del_not)
		filters = {"name": ["in",cust_list],
					"billing_mode": "ASAP"}
		cust_list_asap = frappe.get_all("Customer", filters = filters )
		asap_cust = [x.name for x in cust_list_asap]
		print(asap_cust)
		return asap_cust

	def get_asap_invoices(self, cust_list):
		pass


	def get_delivery_notes_for_customer(self, cust, delivery_notes): 
	#Funktion listet alle Lieferscheine für den jeweiligen Kunden auf 
		cust_del_note = [] 

		for el in delivery_notes: 

			if el["customer"] == cust: 
				cust_del_note.append(el) 

		return cust_del_note 

	def get_invoicing_items_for_cust(self,cust):
		#Funktion liefert eine Liste aller abrechenbaren Items für den jeweiligen Kunden
		
		del_not = self.get_delivery_notes_for_invoicing()
		cust_doc = frappe.get_doc("Customer",cust)	
		delivery_note_list = self.get_delivery_notes_for_customer(cust,del_not) 
		#print(delivery_note_list)
		if len(delivery_note_list) < 1:
			frappe.msgprint("Keine abrechnenbaren Lieferscheine vorhanden")
		else:
			items = []
			
			for dn in delivery_note_list: 

				item_doc = frappe.get_doc("Delivery Note", dn["name"]) 
				for item in item_doc.items: 
					print(item.item_group)
					item.dn_detail= dn["name"]
					print("item.dn_detail")
					print(item.dn_detail)
					items.append(item)
		return items
	
	@frappe.whitelist()
	def get_invoice_dict(self): 
		self.get_customer_asap_billing_mode()
		del_not = self.get_delivery_notes_for_invoicing()
		cust_list = self.get_customer_for_invoicing(del_not)
		if self.customer: 
			customer_list = [self.customer]
		else:
			customer_list = cust_list

		print(len(customer_list))
		cust_count = 0
		invoice_count = 0
		for cust in customer_list:
			cust_doc = frappe.get_doc("Customer",cust)
			invoice_in_draft = frappe.get_all("Sales Invoice", filters = {"status" : "Draft", "customer": cust})
			if len(invoice_in_draft) > 0:
				self.log = "Für Kunde"+ " "+ cust + " wurden keine Rechnungen erstellt, da noch nicht berechnete Rechnungen in Draft vorhanden" 
				continue
			else:
				cust_count += 1
				items = self.get_invoicing_items_for_cust(cust)
				print(items)
				print("len Items")
				print(len(items))
				invoicing_items = []

				if cust_doc.billing_mode == "ASAP":
					x = self.get_delivery_notes_for_customer(cust, del_not)
					for dn in x:
						item_doc = frappe.get_doc("Delivery Note", dn["name"]) 
						items = [self.create_invoice_doc_item(item) for item in item_doc.items]
						if len(items) > 0:
							self.create_invoice(cust, items, "Abrechnung Lieferschein " + dn["name"]+ " " + cust_doc.customer_name)
							invoice_count += 1
				elif cust_doc.billing_mode == "Collective Bill":
					for item in items:
						invoice_doc_item = self.create_invoice_doc_item(item)
						invoicing_items.append(invoice_doc_item)
					if len(invoicing_items) > 0:
						self.create_invoice(cust, invoicing_items, "Sammelrechnung " + cust_doc.customer_name)
						invoice_count += 1
				else:	
					item_group_separation_dict = get_item_group_assignment_table(cust)
					print(item_group_separation_dict)
					
					separation_item_groups = [[item_group_separation_dict[x].item_group,item_group_separation_dict[x].filter]  for x in range(1, len(item_group_separation_dict) + 1) ]	
					if cust_doc.billing_mode == "per Item Group":
						print("vor Separation")
						print(len(items))
						for el in separation_item_groups:
							print(el[1])
							print(items)
							a = []
							items_list = items.copy()
							for item in items_list:
							# for i in item_name:
							# 	item = filter(lambda item: item['name'] == i, items)
								print(item)

								#print(item.item_group)
								if item.item_group in el[1]:
									print(True)
									invoice_doc_item = self.create_invoice_doc_item(item)
									print(invoice_doc_item)
									a.append(invoice_doc_item)
									items.remove(item)
									print(len(a))
									print(len(items))
									
								else:
									print(False)
							if len(a) > 0:
								self.create_invoice(cust, a, el[0] + " " +cust_doc.customer_name)
								invoice_count +=1
							print("nach Separation")
							print(len(items))	
						i_items = [self.create_invoice_doc_item(item) for item in items]
						
						if len(i_items) > 0:
							self.create_invoice(cust, i_items, "Abrechnung " + cust_doc.customer_name)	
							invoice_count += 1
					
					if cust_doc.billing_mode == "per Sales Order, remaining per Item Group":
						sales_order_items = []
						item_list = items.copy()
						for item in item_list:
							if item.against_sales_order:
								invoice_doc_item = self.create_invoice_doc_item(item)
								sales_order_items.append(invoice_doc_item)
								items.remove(item)
						if len(sales_order_items) > 0:
							x = [i.sales_order for i in sales_order_items]
							a = list(set(x))
							for el in a:
								sal_ord_it = []
								for i in sales_order_items:
									if i.sales_order == el:
										sal_ord_it.append(i)
								self.create_invoice(cust, sal_ord_it, "Sales Order "+ el+ " " + cust_doc.customer_name)
								invoice_count += 1
						for el in separation_item_groups:
							print(el[1])
							a = []
							it_list = items.copy()
							for item in it_list:
								if item.item_group in el[1]:
									invoice_doc_item = self.create_invoice_doc_item(item)
									a.append(invoice_doc_item)
									items.remove(item)
							if len(a) > 0:
								self.create_invoice(cust, a, el[0] + " " +cust_doc.customer_name)
								invoice_count += 1
						i_items = [self.create_invoice_doc_item(item) for item in items]
						if len(i_items) > 0:
							self.create_invoice(cust, i_items, "Abrechnung " + cust_doc.customer_name)	
							invoice_count += 1
		frappe.msgprint("Für " + str(cust_count)+ " Kunden wurden " + str(invoice_count) + " Rechnungen erstellt.")
		self.date = datetime.today().strftime('%Y-%m-%d')
		self.invoice_count = invoice_count
		self.customer_count = cust_count				
		

	def create_invoice_doc_item(self, item):
		#Funktion kreiert Invoice Item aus den gegebenen Delivery Note Items
		invoice_doc_item = frappe.get_doc({
						"doctype": "Sales Invoice Item",
						"item_code": item.item_code,
						"description": item.description,
						"qty": item.qty,
						"uom" : item.uom,
						"rate": item.rate,
						"sales_order": item.against_sales_order,
						"dn_detail": item.name,
						"parent": "delivery_note",
						"delivery_note": item.dn_detail
						})
		return invoice_doc_item


	def create_invoice(self,cust,invoice_doc_items,title):
		invoice_doc = frappe.get_doc({ 
				"doctype": "Sales Invoice", 
				"title": title,
				"customer": cust,
				"company": frappe.get_doc("Global Defaults").default_company,
				"items": invoice_doc_items
				}) 
		if len(invoice_doc_items)>0:
			
			settings_doc = frappe.get_single("Auto Invoice Generator Settings")
			customer_doc = frappe.get_doc("Customer", cust )
        
			if customer_doc.payment_terms:
				invoice_doc.payment_terms_template = customer_doc.payment_terms
			else:
				invoice_doc.payment_terms_template = settings_doc.payment_terms_template
			invoice_doc.tc_name = settings_doc.tc_name
			tac_doc = frappe.get_doc("Terms and Conditions", settings_doc.tc_name)
			invoice_doc.terms = tac_doc.terms
	
			invoice_doc.taxes_and_charges = party_st(invoice_doc.customer, "Customer", invoice_doc.posting_date, invoice_doc.company)
			taxes = frappe.get_doc("Sales Taxes and Charges Template", settings_doc.taxes_and_charges).taxes
	
			for tax in taxes:
				new_tax = frappe.get_doc({
						"doctype": "Sales Taxes and Charges",
						"charge_type": tax.charge_type,
						"account_head": tax.account_head,
						"rate": tax.rate,
						"description": tax.description
					})
			invoice_doc.append("taxes", new_tax)
			invoice_doc.save()

	# def validate_items(self,item_list):
	# 	print("len(item_list):")
	# 	print(len(item_list))
	# 	print("len(set(item_list)):")
	# 	print(len(set(item_list)))
	# 	if len(item_list) == len(set(item_list)):
	# 		return True
	# 	else:
	# 		frappe.msgprint("Rechnungspositionen doppelt")
