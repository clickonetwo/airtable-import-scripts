import {mergeSameHousehold, readAllHouseholds, canonicalizeHouseholdNames, writeAllHouseholds} from "./households.js";
import {loadAirtableInfo, loadContacts} from "./contacts.js";

async function driver() {
    loadAirtableInfo()
    console.log("Loading Airtable Contacts...")
    const contacts = await loadContacts()
    console.log("Loading Household Accounts...")
    const rows = await readAllHouseholds(contacts, 'local/household-accounts.csv')
    console.log("Analyzing Households and updating Airtable Contact Affiliations...")
    await canonicalizeHouseholdNames(rows)
    const households = await mergeSameHousehold(contacts, rows)
    console.log("Writing spreadsheet version of Airtable updates...")
    await writeAllHouseholds(households, 'local/household-contact-import.csv')
}

driver()
    .then(() => console.log("Import processed, output ready."))
