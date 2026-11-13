// Public policy documents and journal hashes from the original #1662 provisioning.
export const provisionedObjectPolicies = {
  "app": {
    "sha256": "4604766016eed7c3a6ee7323d2d663f8ca78894047e5f2fceb1553d3309b6113",
    "document": {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "DenyAdmin",
          "Effect": "Deny",
          "Action": [
            "admin:*"
          ]
        },
        {
          "Sid": "DenySts",
          "Effect": "Deny",
          "Action": [
            "sts:AssumeRole"
          ]
        },
        {
          "Sid": "DenyFormal",
          "Effect": "Deny",
          "Action": [
            "s3:*"
          ],
          "Resource": [
            "arn:aws:s3:::agricola",
            "arn:aws:s3:::agricola/*"
          ]
        },
        {
          "Sid": "ListLive",
          "Effect": "Allow",
          "Action": [
            "s3:ListBucket"
          ],
          "Resource": [
            "arn:aws:s3:::oa-prerelease-main"
          ],
          "Condition": {
            "StringLike": {
              "s3:prefix": "live/*"
            }
          }
        },
        {
          "Sid": "LiveObjects",
          "Effect": "Allow",
          "Action": [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject"
          ],
          "Resource": [
            "arn:aws:s3:::oa-prerelease-main/live/*"
          ]
        },
        {
          "Sid": "DenyScratchObjects",
          "Effect": "Deny",
          "Action": [
            "s3:*"
          ],
          "Resource": [
            "arn:aws:s3:::oa-prerelease-main/test/*"
          ]
        }
      ]
    }
  },
  "backup": {
    "sha256": "d52e7579229eb2fa414d826fd44afe1d6a923b15e00a23ba1b26e02c3d753e14",
    "document": {
      "Version": "2012-10-17",
      "Statement": [
        {
          "Sid": "DenyAdmin",
          "Effect": "Deny",
          "Action": [
            "admin:*"
          ]
        },
        {
          "Sid": "DenySts",
          "Effect": "Deny",
          "Action": [
            "sts:AssumeRole"
          ]
        },
        {
          "Sid": "DenyFormal",
          "Effect": "Deny",
          "Action": [
            "s3:*"
          ],
          "Resource": [
            "arn:aws:s3:::agricola",
            "arn:aws:s3:::agricola/*"
          ]
        },
        {
          "Sid": "ListLiveAndScratch",
          "Effect": "Allow",
          "Action": [
            "s3:ListBucket"
          ],
          "Resource": [
            "arn:aws:s3:::oa-prerelease-main"
          ],
          "Condition": {
            "StringLike": {
              "s3:prefix": [
                "live/*",
                "test/*"
              ]
            }
          }
        },
        {
          "Sid": "ReadLive",
          "Effect": "Allow",
          "Action": [
            "s3:GetObject"
          ],
          "Resource": [
            "arn:aws:s3:::oa-prerelease-main/live/*"
          ]
        },
        {
          "Sid": "DenyLiveWrites",
          "Effect": "Deny",
          "Action": [
            "s3:PutObject",
            "s3:DeleteObject"
          ],
          "Resource": [
            "arn:aws:s3:::oa-prerelease-main/live/*"
          ]
        },
        {
          "Sid": "ScratchObjects",
          "Effect": "Allow",
          "Action": [
            "s3:GetObject",
            "s3:PutObject",
            "s3:DeleteObject"
          ],
          "Resource": [
            "arn:aws:s3:::oa-prerelease-main/test/*"
          ]
        }
      ]
    }
  }
}
