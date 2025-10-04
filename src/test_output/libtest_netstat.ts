const netstat = require('node-netstat')

console.log('Default data in netstat object:')

netstat({}, (data: any) => {                     

    console.log('Connection:', data)
})