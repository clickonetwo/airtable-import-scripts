import {
    readAllHouseholds,
    InputRow,
    canonicalizeHouseholdNames,
    mergeSameHousehold,
    IndexedRows,
    writeAllHouseholds
} from './households.js'
import assert from 'assert';

async function testLoadHouseholds(path: string = "local/household-accounts.csv") {
    const rows = await readAllHouseholds(path)
    assert(rows.length === 6687)
    return rows
}

async function testStripHouseholdSuffix(rows: InputRow[]) {
    const result = await canonicalizeHouseholdNames(rows)
    assert(rows.length - result.length === 23)
    return result
}

async function testAll(...tests: string[]) {
    if (tests.length == 0) {
        tests = ['strip', 'merge', 'output']
    }
    let rows = await testLoadHouseholds()
    let households: IndexedRows = {}
    if (tests.includes('strip')) {
        rows = await testStripHouseholdSuffix(rows)
    }
    if (tests.includes('merge')) {
        households = await mergeSameHousehold(rows)
    }
    if (tests.includes('output')) {
        writeAllHouseholds(households, 'local/household-contact-import.csv')
    }
}

testAll(...process.argv.slice(2))
    .then(() => console.log("Tests completed with no errors"))
