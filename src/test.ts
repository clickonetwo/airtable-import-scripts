import {
    canonicalizeHouseholdNames,
    IndexedRows,
    InputRow,
    mergeSameHousehold,
    readAllHouseholds,
    writeAllHouseholds
} from './households.js'
import {IndexedContacts, loadAirtableInfo, loadContacts} from "./contacts.js";

async function testLoadHouseholds(contacts: IndexedContacts, path: string = "local/household-accounts.csv") {
    const rows = await readAllHouseholds(contacts, path)
    console.log(`Found ${rows.length} contact rows`)
    return rows
}

async function testStripHouseholdSuffix(rows: InputRow[]) {
    const households = canonicalizeHouseholdNames(rows)
    console.log(`Found ${Object.keys(households).length} households`)
    return households
}

async function testWriteAllHouseholds(households: IndexedRows, path: string = "local/household-accounts.csv") {
    await writeAllHouseholds(households, path)
}

async function testLoadContacts() {
    const contacts = await loadContacts()
    console.log(`Found ${Object.keys(contacts).length} contacts`)
    return contacts
}

async function testAll(...tests: string[]) {
    if (tests.length == 0) {
        tests = ['households']
    }
    if (tests.includes('households')) {
        loadAirtableInfo()
        const contacts = await testLoadContacts()
        const rows = await testLoadHouseholds(contacts)
        await testStripHouseholdSuffix(rows)
        const households = await mergeSameHousehold(contacts, rows)
        await testWriteAllHouseholds(households, 'local/household-contact-import.csv')
    }
}

testAll(...process.argv.slice(2))
    .then(() => console.log("Tests completed with no errors"))
