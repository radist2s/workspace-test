// import {app} from '@radist2s/app'
import {app} from '@radist2s/app'
import {Button} from '@radist2s/app/comps/Button'
// import {app} from '@radist2s/app/src'
// import {Button} from '@radist2s/app/src/comps/Button'
// import {app} from '@radist2s/app/dist/index'
// added some comment 9


export default function Index() {
  console.log('Site', app())

  return (
    <h1>{app()}<Button/></h1>
    // <h1>{app()}</h1>
  )
}
